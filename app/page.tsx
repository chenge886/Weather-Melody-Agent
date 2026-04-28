"use client";

import { FormEvent, type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

import { useContinuousVoiceAgent } from "@/hooks/useContinuousVoiceAgent";
import type { TrackCard } from "@/lib/types";

const QUICK_PROMPTS = [
  "今晚要写方案，想听不压抑的歌",
  "早上通勤地铁，给我提神但不炸裂的歌",
  "下雨天，想要有城市感的中文歌",
  "今天安排很满，给我稳节奏的背景乐"
];

function formatClock(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export default function HomePage() {
  const agent = useContinuousVoiceAgent();
  const [manualInput, setManualInput] = useState("");
  const [clock, setClock] = useState(() => new Date());
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [musicStatus, setMusicStatus] = useState("等待播放");
  const [musicCurrentTime, setMusicCurrentTime] = useState(0);
  const [musicDuration, setMusicDuration] = useState(0);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activeTrack = agent.tracks[0];
  const dateLabel = useMemo(
    () => clock.toLocaleDateString("zh-CN", { month: "short", day: "numeric", weekday: "long" }),
    [clock]
  );
  const playingTrack = useMemo(
    () => agent.tracks.find((track) => track.id === playingTrackId) ?? null,
    [agent.tracks, playingTrackId]
  );
  const progressPercent = musicDuration > 0 ? Math.min(100, (musicCurrentTime / musicDuration) * 100) : 0;

  const formatDuration = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remain = Math.floor(seconds % 60);
    return `${minutes}:${String(remain).padStart(2, "0")}`;
  };

  const getTrackPlayableSrc = (track: TrackCard): string | null => {
    if (!track.streamUrl) return null;
    return `/api/music/stream?target=${encodeURIComponent(track.streamUrl)}`;
  };

  const playTrack = async (track: TrackCard) => {
    const audio = musicAudioRef.current;
    if (!audio) return;
    const src = getTrackPlayableSrc(track);
    if (!src) {
      setMusicStatus("当前歌曲没有可播地址");
      return;
    }

    if (playingTrackId === track.id) {
      if (audio.paused) {
        try {
          await audio.play();
          setMusicStatus(`正在播放：${track.title}`);
          setIsMusicPlaying(true);
        } catch {
          setMusicStatus("播放失败，可能是源地址不可访问");
        }
      } else {
        audio.pause();
      }
      return;
    }

    audio.pause();
    audio.src = src;
    audio.load();

    try {
      await audio.play();
      setPlayingTrackId(track.id);
      setMusicCurrentTime(0);
      setMusicDuration(0);
      setIsMusicPlaying(true);
      setMusicStatus(`正在播放：${track.title}`);
    } catch {
      setMusicStatus("播放失败，可能是源地址不可访问");
    }
  };

  const seekMusic = (percent: number) => {
    const audio = musicAudioRef.current;
    if (!audio || !Number.isFinite(musicDuration) || musicDuration <= 0) return;
    const next = (Math.max(0, Math.min(percent, 100)) / 100) * musicDuration;
    audio.currentTime = next;
    setMusicCurrentTime(next);
  };

  const toggleCurrentTrackPlay = async () => {
    const audio = musicAudioRef.current;
    if (!audio) return;

    if (!playingTrack) {
      const firstPlayable = agent.tracks.find((track) => Boolean(track.streamUrl));
      if (!firstPlayable) {
        setMusicStatus("当前歌单没有可播放地址");
        return;
      }
      await playTrack(firstPlayable);
      return;
    }

    if (audio.paused) {
      try {
        await audio.play();
        setMusicStatus(`正在播放：${playingTrack.title}`);
        setIsMusicPlaying(true);
      } catch {
        setMusicStatus("播放失败，可能被浏览器拦截");
      }
    } else {
      audio.pause();
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = manualInput.trim();
    if (!text) return;
    setManualInput("");
    await agent.submitText(text);
  };

  useEffect(() => {
    const audio = musicAudioRef.current;
    if (!audio) return;

    const onTime = () => setMusicCurrentTime(audio.currentTime || 0);
    const onLoaded = () => setMusicDuration(audio.duration || 0);
    const onPause = () => {
      setIsMusicPlaying(false);
      if (audio.currentTime > 0 && !audio.ended) {
        setMusicStatus("已暂停");
      }
    };
    const onPlay = () => {
      setIsMusicPlaying(true);
    };
    const onEnded = () => {
      setMusicStatus("播放结束");
      setPlayingTrackId(null);
      setIsMusicPlaying(false);
      setMusicCurrentTime(0);
    };
    const onError = () => {
      setMusicStatus("音频加载失败");
      setIsMusicPlaying(false);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, []);

  useEffect(() => {
    if (!playingTrackId) return;
    const exists = agent.tracks.some((track) => track.id === playingTrackId);
    if (exists) return;

    const audio = musicAudioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }

    setPlayingTrackId(null);
    setIsMusicPlaying(false);
    setMusicCurrentTime(0);
    setMusicDuration(0);
  }, [agent.tracks, playingTrackId]);

  return (
    <main className="dj-stage">
      <section className="dj-shell">
        <header className="dj-header">
          <div className="brand-wrap">
            <img
              src="https://images.unsplash.com/photo-1526336024174-e58f5cdd8e13?q=80&w=200&auto=format&fit=crop"
              alt="DJ Avatar"
              className="dj-avatar"
            />
            <div>
              <p className="dot-title">Claudio</p>
              <p className="status-text">
                <span className={`dot ${agent.agentState}`} />
                {agent.agentState === "speaking" ? "Speaking..." : agent.agentState === "thinking" ? "Thinking..." : "On Air"}
              </p>
            </div>
          </div>
          <div className="header-meta">
            <p className="clock">{formatClock(clock)}</p>
            <p className="date">{dateLabel}</p>
          </div>
        </header>

        <section className="hero">
          <div className="hero-wave">
            {agent.waveform.map((value, index) => (
              <span
                // eslint-disable-next-line react/no-array-index-key
                key={`wave-${index}`}
                style={{ "--h": `${Math.max(0.08, value)}fr` } as CSSProperties}
              />
            ))}
          </div>
          <div className="hero-track">
            <h1>{activeTrack?.title ?? "等待推荐..."}</h1>
            <p>{activeTrack ? `${activeTrack.artist}${activeTrack.album ? ` · ${activeTrack.album}` : ""}` : "先告诉我天气、喜好和日程，我来做你的 AI DJ。"}</p>
            <div className="progress-row">
              <span>{agent.agentState === "speaking" ? "LIVE" : "IDLE"}</span>
              <div className="progress-line">
                <i style={{ width: `${Math.min(92, 18 + agent.micLevel * 70)}%` }} />
              </div>
              <span>{agent.weatherSummary}</span>
            </div>
            <div className="music-inline-player">
              <p>{playingTrack ? `Now Playing: ${playingTrack.title} - ${playingTrack.artist}` : "Now Playing: - -"}</p>
              <div className="mini-progress">
                <i style={{ width: `${musicDuration > 0 ? Math.min(100, (musicCurrentTime / musicDuration) * 100) : 0}%` }} />
              </div>
              <small>{formatDuration(musicCurrentTime)} / {formatDuration(musicDuration)} · {musicStatus}</small>
            </div>
          </div>
        </section>

        <section className="quick-row">
          {QUICK_PROMPTS.map((prompt) => (
            <button key={prompt} className="prompt-chip" onClick={() => void agent.submitText(prompt)}>
              {prompt}
            </button>
          ))}
        </section>

        <section className="layout-grid">
          <aside className="panel queue-panel">
            <div className="panel-title">QUEUE</div>
            {agent.tracks.length === 0 ? (
              <p className="muted">等你一句话，我会按天气 + 喜好 + 日程生成歌单。</p>
            ) : (
              <ul className="queue-list">
                {agent.tracks.map((track, index) => (
                  <li key={`${track.id}-${track.title}`} className={index === 0 ? "active" : ""}>
                    <div>
                      <p>{track.title}</p>
                      <small>{track.artist}</small>
                    </div>
                    <div className="track-actions">
                      <button
                        type="button"
                        onClick={() => void playTrack(track)}
                        disabled={!track.streamUrl}
                        title={track.streamUrl ? "站内播放" : "无可播地址"}
                      >
                        {playingTrackId === track.id ? (isMusicPlaying ? "暂停" : "继续") : "播放"}
                      </button>
                      <a href={track.deepLink} target="_blank" rel="noreferrer">
                        打开
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="panel chat-panel">
            <div className="panel-title">CLAUDIO LIVE</div>
            <div className="chat-feed">
              {agent.messages.length === 0 ? (
                <p className="muted">你可以说：“杭州下雨，下午开会，晚上跑步，给我一套不困的歌。”</p>
              ) : (
                agent.messages.map((message) => (
                  <article key={message.id} className={`chat-item ${message.role}`}>
                    <span>{message.role === "assistant" ? "CLAUDIO" : "YOU"}</span>
                    <p>{message.text || "..."}</p>
                  </article>
                ))
              )}
            </div>
          </section>

          <aside className="panel profile-panel">
            <div className="panel-title">TASTE.MD</div>
            <label>
              城市 / 地点
              <input
                value={agent.profile.location}
                onChange={(event) => agent.setProfile((prev) => ({ ...prev, location: event.target.value }))}
                placeholder="例如：上海"
              />
            </label>
            <label>
              喜好歌单 / 风格
              <textarea
                value={agent.profile.preferenceText}
                onChange={(event) => agent.setProfile((prev) => ({ ...prev, preferenceText: event.target.value }))}
                placeholder="例如：Jazz, Neo-classical, 90s华语"
              />
            </label>
            <label>
              今日日程
              <textarea
                value={agent.profile.scheduleText}
                onChange={(event) => agent.setProfile((prev) => ({ ...prev, scheduleText: event.target.value }))}
                placeholder="每行一条，例如：09:30 评审会"
              />
            </label>
          </aside>
        </section>

        <form className="composer" onSubmit={onSubmit}>
          <input
            value={manualInput}
            onChange={(event) => setManualInput(event.target.value)}
            placeholder="Say something to the DJ..."
          />
          <button type="button" onClick={() => void agent.startListening()} className="icon-btn">
            {agent.listeningEnabled ? "听" : "麦"}
          </button>
          <button type="button" onClick={agent.stopListening} className="icon-btn">
            停
          </button>
          <button type="button" onClick={agent.interrupt} className="icon-btn">
            断
          </button>
          <button type="submit" className="send-btn">
            发送
          </button>
        </form>

        <section className="status-footer">
          <p>{agent.interimTranscript || agent.lastTranscript || "CONNECTED."}</p>
          {agent.error ? <p className="error">{agent.error}</p> : null}
        </section>

        <section className="music-deck" aria-label="音乐播放器">
          <button
            type="button"
            className="music-toggle"
            onClick={() => void toggleCurrentTrackPlay()}
            disabled={!playingTrack?.streamUrl && !agent.tracks.some((track) => Boolean(track.streamUrl))}
          >
            {isMusicPlaying ? "暂停" : "播放"}
          </button>
          <div className="music-deck-main">
            <p className="music-deck-title">{playingTrack ? `${playingTrack.title} - ${playingTrack.artist}` : "未选择可播放歌曲"}</p>
            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={progressPercent}
              onChange={(event) => seekMusic(Number(event.target.value))}
              className="music-seek"
              disabled={!playingTrack || musicDuration <= 0}
            />
            <p className="music-deck-meta">
              <span>{formatDuration(musicCurrentTime)}</span>
              <span>{musicStatus}</span>
              <span>{formatDuration(musicDuration)}</span>
            </p>
          </div>
        </section>

        <audio ref={agent.audioRef} className="hidden-audio" />
        <audio ref={musicAudioRef} className="hidden-audio" preload="none" />
      </section>
    </main>
  );
}
