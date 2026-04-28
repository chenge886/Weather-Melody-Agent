import { DeepSeekClient, type ChatMessage } from "@/lib/llm/deepseek";
import { FishTtsClient } from "@/lib/tts/fish";
import type {
  AgentRecommendResult,
  ConversationTurn,
  MusicSearchAdapter,
  TrackCard,
  UserProfileInput,
  WeatherSnapshot
} from "@/lib/types";
import { QWeatherClient } from "@/lib/weather/qweather";

interface RecommendationPlan {
  replyText: string;
  query: string;
  mood?: string;
  moodTags: string[];
  followUp?: string;
}

interface BuildContextInput {
  transcript: string;
  context?: ConversationTurn[];
  profile?: UserProfileInput;
  weather?: WeatherSnapshot | null;
}

interface SessionInput {
  transcript: string;
  context?: ConversationTurn[];
  profile?: UserProfileInput;
  adapter: MusicSearchAdapter;
  limit?: number;
  weatherClient?: QWeatherClient;
  deepSeekClient?: DeepSeekClient;
  fishTtsClient?: FishTtsClient;
}

export type DjLiveEvent =
  | { event: "meta"; data: { weather?: WeatherSnapshot | null; tracks: TrackCard[]; moodTags: string[]; replyLead: string } }
  | { event: "text_delta"; data: { delta: string } }
  | { event: "text_done"; data: { text: string; followUp?: string } }
  | { event: "audio_chunk"; data: { mimeType: "audio/mpeg"; base64: string } }
  | { event: "audio_done"; data: { enabled: boolean } }
  | { event: "error"; data: { message: string } };

const SENTENCE_SPLITTER = /(?<=[。！？!?;；\n])/;

function cleanArray(items: string[] | undefined): string[] {
  if (!items) return [];
  return items.map((item) => item.trim()).filter(Boolean);
}

function parseJsonBlock(raw: string): Record<string, unknown> | null {
  const text = raw.trim();
  if (!text) return null;

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || start >= end) return null;

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function chunkText(text: string, size = 8): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

function joinContext(input: BuildContextInput): string {
  const preferences = cleanArray(input.profile?.preferencePlaylists);
  const schedule = cleanArray(input.profile?.schedule);
  const location = input.profile?.location?.trim();
  const recentTurns = (input.context ?? []).slice(-4).map((turn) => `${turn.role}: ${turn.text}`).join("\n");

  const weatherText = input.weather
    ? `${input.weather.locationName} ${input.weather.text} ${Number.isFinite(input.weather.tempC) ? `${input.weather.tempC}°C` : ""} ${Number.isFinite(input.weather.humidity) ? `湿度${input.weather.humidity}%` : ""}`.trim()
    : "暂无天气数据";

  return [
    `用户最新输入：${input.transcript}`,
    location ? `地点：${location}` : "地点：未提供",
    preferences.length > 0 ? `偏好歌单/关键词：${preferences.join("、")}` : "偏好歌单/关键词：未提供",
    schedule.length > 0 ? `今日日程：${schedule.join("；")}` : "今日日程：未提供",
    `天气：${weatherText}`,
    recentTurns ? `最近对话：\n${recentTurns}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildFallbackPlan(input: BuildContextInput): RecommendationPlan {
  const text = input.transcript.trim();
  const preferences = cleanArray(input.profile?.preferencePlaylists);
  const schedule = cleanArray(input.profile?.schedule);

  const moodTags: string[] = [];
  if (input.weather?.text.includes("雨")) moodTags.push("雨天");
  if (input.weather?.text.includes("晴")) moodTags.push("晴朗");
  if ((input.weather?.tempC ?? 0) >= 30) moodTags.push("降温感");
  if ((input.weather?.tempC ?? 0) <= 8) moodTags.push("温暖感");
  if (schedule.some((item) => item.includes("会议") || item.includes("开会"))) moodTags.push("专注");
  if (schedule.some((item) => item.includes("通勤") || item.includes("地铁"))) moodTags.push("通勤");

  const mood = moodTags[0] ?? "松弛";
  const queryParts = [text, ...preferences.slice(0, 2), mood].filter(Boolean);
  const query = queryParts.join(" ").trim();

  return {
    replyText: `收到，我会按「${mood}」和你的今天安排来挑歌，先给你一组能马上进入状态的推荐。`,
    query: query || text,
    mood,
    moodTags: moodTags.length > 0 ? moodTags : ["松弛"],
    followUp: "你希望这组歌更偏人声叙事，还是偏器乐氛围？"
  };
}

async function buildPlanWithDeepSeek(client: DeepSeekClient, input: BuildContextInput): Promise<RecommendationPlan> {
  const systemPrompt = [
    "你是一个中文 AI DJ，任务是生成音乐推荐计划。",
    "必须返回 JSON，不要输出 JSON 之外内容。",
    "JSON 字段：replyText, query, mood, moodTags(array), followUp。",
    "要求：",
    "1) 优先依据天气、用户歌单偏好、日程来确定推荐方向。",
    "2) query 是给音乐搜索的关键词，不超过 20 个字。",
    "3) replyText 2-3 句，口吻像电台 DJ。"
  ].join("\n");

  const userPrompt = joinContext(input);
  const responseText = await client.complete(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    { temperature: 0.7, maxTokens: 420 }
  );

  const parsed = parseJsonBlock(responseText);
  if (!parsed) {
    return buildFallbackPlan(input);
  }

  const moodTags = Array.isArray(parsed.moodTags)
    ? parsed.moodTags.map((item) => String(item).trim()).filter(Boolean)
    : [];

  return {
    replyText: typeof parsed.replyText === "string" && parsed.replyText.trim()
      ? parsed.replyText.trim()
      : buildFallbackPlan(input).replyText,
    query: typeof parsed.query === "string" && parsed.query.trim()
      ? parsed.query.trim()
      : buildFallbackPlan(input).query,
    mood: typeof parsed.mood === "string" ? parsed.mood.trim() : undefined,
    moodTags: moodTags.length > 0 ? moodTags : buildFallbackPlan(input).moodTags,
    followUp: typeof parsed.followUp === "string" ? parsed.followUp.trim() : undefined
  };
}

function enrichTrackReason(track: TrackCard, moodTags: string[], weather?: WeatherSnapshot | null): TrackCard {
  const tagText = moodTags.slice(0, 2).join(" / ");
  const weatherHint = weather ? `${weather.text}${Number.isFinite(weather.tempC) ? ` ${weather.tempC}°C` : ""}` : "";
  const reason = track.reason?.trim()
    ? track.reason
    : `适配当前${tagText || "情绪"}场景${weatherHint ? `（${weatherHint}）` : ""}。`;

  return { ...track, reason };
}

async function resolveWeather(weatherClient: QWeatherClient, profile?: UserProfileInput): Promise<WeatherSnapshot | null> {
  const location = profile?.location?.trim();
  if (!location) return null;
  return weatherClient.getWeatherByLocationQuery(location);
}

async function createRecommendationCore(input: SessionInput): Promise<{
  plan: RecommendationPlan;
  tracks: TrackCard[];
  weather: WeatherSnapshot | null;
  modelProvider: "deepseek" | "fallback";
}> {
  const weatherClient = input.weatherClient ?? new QWeatherClient();
  const deepSeekClient = input.deepSeekClient ?? new DeepSeekClient();
  const weather = await resolveWeather(weatherClient, input.profile);

  const contextInput: BuildContextInput = {
    transcript: input.transcript,
    context: input.context,
    profile: input.profile,
    weather
  };

  let plan = buildFallbackPlan(contextInput);
  let modelProvider: "deepseek" | "fallback" = "fallback";

  if (deepSeekClient.isConfigured()) {
    try {
      plan = await buildPlanWithDeepSeek(deepSeekClient, contextInput);
      modelProvider = "deepseek";
    } catch {
      plan = buildFallbackPlan(contextInput);
      modelProvider = "fallback";
    }
  }

  const queryWithPreferences = [
    plan.query,
    ...cleanArray(input.profile?.preferencePlaylists).slice(0, 2)
  ].join(" ").trim();

  const tracks = (await input.adapter.searchTracks(queryWithPreferences || input.transcript, plan.mood, input.limit ?? 6))
    .map((track) => enrichTrackReason(track, plan.moodTags, weather));

  return { plan, tracks, weather, modelProvider };
}

function createNarrationPrompt(core: {
  plan: RecommendationPlan;
  tracks: TrackCard[];
  weather: WeatherSnapshot | null;
  input: SessionInput;
}): ChatMessage[] {
  const preferences = cleanArray(core.input.profile?.preferencePlaylists);
  const schedule = cleanArray(core.input.profile?.schedule);
  const tracksSummary = core.tracks
    .map((track, index) => `${index + 1}. ${track.title} - ${track.artist}`)
    .join("\n");
  const weatherText = core.weather
    ? `${core.weather.locationName}，${core.weather.text}，${Number.isFinite(core.weather.tempC) ? `${core.weather.tempC}°C` : "温度未知"}`
    : "天气未知";

  const system = [
    "你是中文 AI DJ Claudio。",
    "请给出 80-150 字播报文案，语气像深夜电台，不浮夸。",
    "文案必须自然提到天气、偏好、日程中至少两个要素。",
    "最后一句给出轻量互动追问，不要输出列表。"
  ].join("\n");

  const user = [
    `用户输入：${core.input.transcript}`,
    `推荐方向：${core.plan.moodTags.join("、")}`,
    `天气：${weatherText}`,
    preferences.length > 0 ? `偏好：${preferences.join("、")}` : "偏好：未提供",
    schedule.length > 0 ? `日程：${schedule.join("；")}` : "日程：未提供",
    `歌曲：\n${tracksSummary}`
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
}

function takeSpeakableSegments(buffer: string, flushAll: boolean): { remain: string; segments: string[] } {
  const raw = buffer.split(SENTENCE_SPLITTER);
  if (raw.length === 0) return { remain: "", segments: [] };
  if (flushAll) {
    return {
      remain: "",
      segments: raw.map((seg) => seg.trim()).filter(Boolean)
    };
  }

  const segments = raw.slice(0, -1).map((seg) => seg.trim()).filter(Boolean);
  const remain = raw[raw.length - 1] ?? "";
  return { remain, segments };
}

export async function recommendWithProfile(input: SessionInput): Promise<AgentRecommendResult> {
  const transcript = input.transcript.trim();
  if (!transcript) {
    return {
      replyText: "我在听，你可以告诉我你今天在哪、有什么安排、想要什么气质的歌。",
      tracks: [],
      followUp: "例如：北京下雨，晚上写方案，想要不压抑的中文女声。",
      metadata: {
        modelProvider: "fallback"
      }
    };
  }

  const core = await createRecommendationCore(input);

  return {
    replyText: core.plan.replyText,
    tracks: core.tracks,
    followUp: core.plan.followUp,
    metadata: {
      weather: core.weather,
      moodTags: core.plan.moodTags,
      playlistQuery: core.plan.query,
      scheduleHint: cleanArray(input.profile?.schedule).slice(0, 1)[0],
      modelProvider: core.modelProvider
    }
  };
}

export async function* streamDjSession(input: SessionInput): AsyncGenerator<DjLiveEvent> {
  const transcript = input.transcript.trim();
  if (!transcript) {
    yield {
      event: "error",
      data: {
        message: "输入为空，请先告诉我你的天气、歌单偏好或日程。"
      }
    };
    return;
  }

  const deepSeekClient = input.deepSeekClient ?? new DeepSeekClient();
  const fishClient = input.fishTtsClient ?? new FishTtsClient();

  const core = await createRecommendationCore({ ...input, deepSeekClient });
  yield {
    event: "meta",
    data: {
      weather: core.weather,
      tracks: core.tracks,
      moodTags: core.plan.moodTags,
      replyLead: core.plan.replyText
    }
  };

  let fullText = "";
  let ttsBuffer = "";
  const followUp = core.plan.followUp;

  const emitTts = async function* (segment: string): AsyncGenerator<DjLiveEvent> {
    if (!fishClient.isConfigured()) return;
    const text = segment.trim();
    if (!text) return;

    try {
      for await (const chunk of fishClient.streamSpeech(text, { speed: 1 })) {
        yield {
          event: "audio_chunk",
          data: {
            mimeType: "audio/mpeg",
            base64: Buffer.from(chunk).toString("base64")
          }
        };
      }
    } catch {
      // TTS fail does not break recommendation text stream
    }
  };

  if (deepSeekClient.isConfigured()) {
    const messages = createNarrationPrompt({ plan: core.plan, tracks: core.tracks, weather: core.weather, input });

    try {
      for await (const delta of deepSeekClient.stream(messages, { temperature: 0.72, maxTokens: 360 })) {
        if (!delta) continue;
        fullText += delta;
        ttsBuffer += delta;
        yield { event: "text_delta", data: { delta } };

        const ready = takeSpeakableSegments(ttsBuffer, false);
        ttsBuffer = ready.remain;
        for (const segment of ready.segments) {
          yield* emitTts(segment);
        }
      }
    } catch {
      const fallbackNarration = `${core.plan.replyText} 我先从这几首开始播，你也可以继续告诉我你接下来要做什么，我会实时改歌单。`;
      for (const delta of chunkText(fallbackNarration)) {
        fullText += delta;
        ttsBuffer += delta;
        yield { event: "text_delta", data: { delta } };
      }
    }
  } else {
    const fallbackNarration = `${core.plan.replyText} 现在天气和你的安排我都考虑进去了，下面这组歌先让你稳住状态。`;
    for (const delta of chunkText(fallbackNarration)) {
      fullText += delta;
      ttsBuffer += delta;
      yield { event: "text_delta", data: { delta } };
    }
  }

  const remaining = takeSpeakableSegments(ttsBuffer, true);
  for (const segment of remaining.segments) {
    yield* emitTts(segment);
  }

  yield {
    event: "text_done",
    data: {
      text: fullText.trim() || core.plan.replyText,
      followUp
    }
  };

  yield {
    event: "audio_done",
    data: {
      enabled: fishClient.isConfigured()
    }
  };
}

