"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import type { AgentState, ConversationTurn, TrackCard } from "@/lib/types";

export interface ProfileDraft {
  location: string;
  preferenceText: string;
  scheduleText: string;
}

interface DjMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
}

interface LiveEvent {
  event: string;
  data?: Record<string, unknown>;
}

interface UseContinuousVoiceAgentResult {
  agentState: AgentState;
  micLevel: number;
  waveform: number[];
  interimTranscript: string;
  lastTranscript: string;
  replyText: string;
  tracks: TrackCard[];
  messages: DjMessage[];
  weatherSummary: string;
  error: string;
  listeningEnabled: boolean;
  profile: ProfileDraft;
  setProfile: (updater: (prev: ProfileDraft) => ProfileDraft) => void;
  startListening: () => Promise<void>;
  stopListening: () => void;
  interrupt: () => void;
  submitText: (text: string) => Promise<void>;
  audioRef: MutableRefObject<HTMLAudioElement | null>;
}

function parsePreferenceText(text: string): string[] {
  return text
    .split(/[\n,，、]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseScheduleText(text: string): string[] {
  return text
    .split(/[\n;；]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function useContinuousVoiceAgent(): UseContinuousVoiceAgentResult {
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [micLevel, setMicLevel] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(Array.from({ length: 56 }, () => 0.08));
  const [interimTranscript, setInterimTranscript] = useState("");
  const [lastTranscript, setLastTranscript] = useState("");
  const [replyText, setReplyText] = useState("");
  const [tracks, setTracks] = useState<TrackCard[]>([]);
  const [messages, setMessages] = useState<DjMessage[]>([]);
  const [weatherSummary, setWeatherSummary] = useState("天气未连接");
  const [error, setError] = useState("");
  const [listeningEnabled, setListeningEnabled] = useState(false);
  const [profile, setProfile] = useState<ProfileDraft>({
    location: "上海",
    preferenceText: "爵士, neo-classical, 华语流行",
    scheduleText: "09:30 评审会\n14:00 写方案\n20:00 夜跑"
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const speakingRef = useRef(false);
  const isThinkingRef = useRef(false);
  const shouldListenRef = useRef(false);
  const profileRef = useRef(profile);
  const messagesRef = useRef<DjMessage[]>(messages);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const sourceQueueRef = useRef<Uint8Array[]>([]);
  const fallbackAudioRef = useRef<Uint8Array[]>([]);
  const usingMediaSourceRef = useRef(false);
  const sourceOpenRef = useRef(false);
  const objectUrlRef = useRef<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const recognitionSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }, []);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const pumpSourceBuffer = useCallback(() => {
    const sourceBuffer = sourceBufferRef.current;
    if (!sourceBuffer || sourceBuffer.updating) return;
    const nextChunk = sourceQueueRef.current.shift();
    if (!nextChunk) {
      if (mediaSourceRef.current?.readyState === "open" && sourceOpenRef.current && speakingRef.current === false) {
        try {
          mediaSourceRef.current.endOfStream();
        } catch {
          // ignore
        }
      }
      return;
    }

    try {
      sourceBuffer.appendBuffer(nextChunk as unknown as BufferSource);
    } catch {
      // ignore invalid chunk
    }
  }, []);

  const resetAudioPipeline = useCallback(() => {
    sourceQueueRef.current = [];
    fallbackAudioRef.current = [];
    sourceOpenRef.current = false;
    sourceBufferRef.current = null;

    if (mediaSourceRef.current) {
      mediaSourceRef.current = null;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }
  }, []);

  const initAudioPipeline = useCallback(() => {
    resetAudioPipeline();
    const audio = audioRef.current;
    if (!audio || typeof window === "undefined") return;

    const supportsMediaSource = "MediaSource" in window;
    if (!supportsMediaSource) {
      usingMediaSourceRef.current = false;
      return;
    }

    usingMediaSourceRef.current = true;
    const mediaSource = new MediaSource();
    mediaSourceRef.current = mediaSource;
    const objectUrl = URL.createObjectURL(mediaSource);
    objectUrlRef.current = objectUrl;
    audio.src = objectUrl;
    audio.load();

    mediaSource.addEventListener("sourceopen", () => {
      if (!mediaSourceRef.current || mediaSourceRef.current.readyState !== "open") return;
      try {
        const sourceBuffer = mediaSourceRef.current.addSourceBuffer("audio/mpeg");
        sourceBuffer.mode = "sequence";
        sourceBufferRef.current = sourceBuffer;
        sourceOpenRef.current = true;
        sourceBuffer.addEventListener("updateend", pumpSourceBuffer);
        pumpSourceBuffer();
      } catch {
        usingMediaSourceRef.current = false;
      }
    }, { once: true });
  }, [pumpSourceBuffer, resetAudioPipeline]);

  const appendAudioChunk = useCallback((base64: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    const chunk = decodeBase64ToUint8Array(base64);

    if (usingMediaSourceRef.current) {
      sourceQueueRef.current.push(chunk);
      pumpSourceBuffer();
      if (audio.paused) {
        void audio.play().catch(() => {
          // ignore autoplay block
        });
      }
      return;
    }

    fallbackAudioRef.current.push(chunk);
  }, [pumpSourceBuffer]);

  const finalizeAudioPipeline = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (usingMediaSourceRef.current) {
      speakingRef.current = false;
      pumpSourceBuffer();
      return;
    }

    if (fallbackAudioRef.current.length === 0) return;
    const blob = new Blob(fallbackAudioRef.current as unknown as BlobPart[], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = url;
    audio.src = url;
    audio.load();
    void audio.play().catch(() => {
      // ignore autoplay block
    });
    speakingRef.current = false;
  }, [pumpSourceBuffer]);

  const stopAudioMeter = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    setMicLevel(0);
  }, []);

  const startAudioMeter = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices) return;
    if (streamRef.current) return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new window.AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    streamRef.current = stream;
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteTimeDomainData(data);
      let sum = 0;
      for (const sample of data) {
        const normalized = sample / 128 - 1;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / data.length);
      setMicLevel(Math.min(1, rms * 4.4));
      rafRef.current = requestAnimationFrame(tick);
    };

    tick();
  }, []);

  const stopRecognition = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
  }, []);

  const startRecognition = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
    } catch {
      // ignore duplicated start
    }
  }, []);

  const updateAssistantText = useCallback((assistantId: string, updater: (prev: string) => string) => {
    setMessages((prev) => prev.map((message) => {
      if (message.id !== assistantId) return message;
      return { ...message, text: updater(message.text) };
    }));
  }, []);

  const buildRequestProfile = useCallback(() => ({
    location: profileRef.current.location.trim(),
    preferencePlaylists: parsePreferenceText(profileRef.current.preferenceText),
    schedule: parseScheduleText(profileRef.current.scheduleText)
  }), []);

  const buildContextTurns = useCallback((): ConversationTurn[] => {
    return messagesRef.current
      .slice(-8)
      .map((message) => ({
        role: message.role,
        text: message.text,
        timestamp: message.timestamp
      }));
  }, []);

  const consumeLiveStream = useCallback(async (response: Response, assistantId: string) => {
    if (!response.body) throw new Error("流式响应不可用");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let index = buffer.indexOf("\n");
      while (index !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf("\n");
        if (!line) continue;

        let payload: LiveEvent | null = null;
        try {
          payload = JSON.parse(line) as LiveEvent;
        } catch {
          payload = null;
        }

        if (!payload) continue;

        if (payload.event === "meta") {
          const tracksData = Array.isArray(payload.data?.tracks) ? (payload.data?.tracks as TrackCard[]) : [];
          setTracks(tracksData);
          if (payload.data?.weather && typeof payload.data.weather === "object") {
            const weather = payload.data.weather as Record<string, unknown>;
            const weatherText = [
              typeof weather.locationName === "string" ? weather.locationName : "",
              typeof weather.text === "string" ? weather.text : "",
              typeof weather.tempC === "number" ? `${weather.tempC}°C` : ""
            ].filter(Boolean).join(" · ");
            setWeatherSummary(weatherText || "天气已连接");
          } else {
            setWeatherSummary("天气未连接");
          }
          if (typeof payload.data?.replyLead === "string") {
            setReplyText(payload.data.replyLead);
          }
          continue;
        }

        if (payload.event === "text_delta") {
          const delta = typeof payload.data?.delta === "string" ? payload.data.delta : "";
          if (!delta) continue;
          setReplyText((prev) => `${prev}${delta}`);
          updateAssistantText(assistantId, (prev) => `${prev}${delta}`);
          continue;
        }

        if (payload.event === "text_done") {
          const fullText = typeof payload.data?.text === "string" ? payload.data.text : "";
          if (fullText) {
            setReplyText(fullText);
            updateAssistantText(assistantId, () => fullText);
          }
          continue;
        }

        if (payload.event === "audio_chunk") {
          const base64 = typeof payload.data?.base64 === "string" ? payload.data.base64 : "";
          if (!base64) continue;
          speakingRef.current = true;
          setAgentState("speaking");
          appendAudioChunk(base64);
          continue;
        }

        if (payload.event === "audio_done") {
          finalizeAudioPipeline();
          if (shouldListenRef.current) {
            setAgentState("listening");
            startRecognition();
          } else {
            setAgentState("idle");
          }
          continue;
        }

        if (payload.event === "error") {
          const message = typeof payload.data?.message === "string" ? payload.data.message : "流式会话异常";
          setError(message);
        }
      }
    }
  }, [appendAudioChunk, finalizeAudioPipeline, startRecognition, updateAssistantText]);

  const submitText = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text) return;

    setError("");
    setLastTranscript(text);
    setInterimTranscript("");
    setReplyText("");
    setAgentState("thinking");
    isThinkingRef.current = true;
    stopRecognition();
    initAudioPipeline();

    const now = new Date().toISOString();
    const assistantId = `assistant-${Date.now()}`;

    setMessages((prev) => {
      const userMessage: DjMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        text,
        timestamp: now
      };
      const assistantMessage: DjMessage = {
        id: assistantId,
        role: "assistant",
        text: "",
        timestamp: now
      };
      return [...prev, userMessage, assistantMessage].slice(-18);
    });

    try {
      const response = await fetch("/api/agent/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: text,
          context: buildContextTurns(),
          profile: buildRequestProfile()
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "推荐服务调用失败");
      }

      await consumeLiveStream(response, assistantId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "推荐生成失败";
      setError(message);
    } finally {
      isThinkingRef.current = false;
      if (!speakingRef.current) {
        if (shouldListenRef.current) {
          setAgentState("listening");
          startRecognition();
        } else {
          setAgentState("idle");
        }
      }
    }
  }, [buildContextTurns, buildRequestProfile, consumeLiveStream, initAudioPipeline, startRecognition, stopRecognition]);

  const setupRecognition = useCallback(() => {
    if (!recognitionSupported || recognitionRef.current || typeof window === "undefined") return;

    const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Constructor) return;

    const recognition = new Constructor();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript?.trim() ?? "";
        if (!text) continue;
        if (result.isFinal) {
          finalText += `${text} `;
        } else {
          interim += `${text} `;
        }
      }

      setInterimTranscript(interim.trim());

      if (finalText.trim() && !isThinkingRef.current) {
        void submitText(finalText.trim());
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "aborted") {
        setError(`语音识别异常：${event.error}`);
      }
    };

    recognition.onend = () => {
      if (shouldListenRef.current && !isThinkingRef.current && !speakingRef.current) {
        setAgentState("listening");
        window.setTimeout(() => {
          if (shouldListenRef.current && !isThinkingRef.current && !speakingRef.current) {
            startRecognition();
          }
        }, 180);
      }
    };

    recognitionRef.current = recognition;
  }, [recognitionSupported, startRecognition, submitText]);

  const startListening = useCallback(async () => {
    shouldListenRef.current = true;
    setListeningEnabled(true);
    setError("");

    setupRecognition();

    try {
      await startAudioMeter();
    } catch {
      setError("麦克风权限不可用，语音可视化已关闭。");
    }

    if (!recognitionSupported) {
      shouldListenRef.current = false;
      setListeningEnabled(false);
      setAgentState("idle");
      setError("当前浏览器不支持连续语音识别，可使用文本输入。");
      return;
    }

    setAgentState("listening");
    startRecognition();
  }, [recognitionSupported, setupRecognition, startAudioMeter, startRecognition]);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    setListeningEnabled(false);
    setAgentState("idle");
    setInterimTranscript("");
    stopRecognition();
    stopAudioMeter();

    speakingRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, [stopAudioMeter, stopRecognition]);

  const interrupt = useCallback(() => {
    speakingRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (shouldListenRef.current) {
      setAgentState("listening");
      startRecognition();
    } else {
      setAgentState("idle");
    }
  }, [startRecognition]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setWaveform((prev) => prev.map((_, index) => {
        if (agentState === "speaking") {
          return 0.15 + Math.abs(Math.sin((Date.now() / 220) + index * 0.35)) * 0.8;
        }
        if (agentState === "listening") {
          return 0.08 + Math.random() * Math.max(0.2, micLevel * 1.2);
        }
        if (agentState === "thinking") {
          return 0.12 + Math.abs(Math.sin((Date.now() / 800) + index * 0.18)) * 0.4;
        }
        return 0.04 + Math.random() * 0.08;
      }));
    }, 80);

    return () => window.clearInterval(timer);
  }, [agentState, micLevel]);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      stopAudioMeter();
      stopRecognition();
      resetAudioPipeline();
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [resetAudioPipeline, stopAudioMeter, stopRecognition]);

  return {
    agentState,
    micLevel,
    waveform,
    interimTranscript,
    lastTranscript,
    replyText,
    tracks,
    messages,
    weatherSummary,
    error,
    listeningEnabled,
    profile,
    setProfile,
    startListening,
    stopListening,
    interrupt,
    submitText,
    audioRef
  };
}
