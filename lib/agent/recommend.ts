import { MUSIC_AGENT_OUTPUT_HINT, MUSIC_AGENT_PERSONA } from "@/lib/agent/prompt";
import type { ConversationTurn, MusicSearchAdapter, TrackCard } from "@/lib/types";

interface RecommendInput {
  transcript: string;
  context?: ConversationTurn[];
  adapter: MusicSearchAdapter;
  limit?: number;
  openAiFetch?: typeof fetch;
  openAiApiKey?: string;
  model?: string;
}

interface RecommendPlan {
  replyText: string;
  query: string;
  mood?: string;
  followUp?: string;
}

function extractJsonBlock(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || start >= end) return null;
  return text.slice(start, end + 1);
}

function extractResponseText(payload: any): string {
  if (typeof payload?.output_text === "string") {
    return payload.output_text;
  }

  if (Array.isArray(payload?.output)) {
    const chunks: string[] = [];
    for (const item of payload.output) {
      if (!Array.isArray(item?.content)) continue;
      for (const content of item.content) {
        if (typeof content?.text === "string") chunks.push(content.text);
      }
    }
    if (chunks.length > 0) return chunks.join("\n");
  }

  return "";
}

function heuristicPlan(transcript: string): RecommendPlan {
  const text = transcript.trim();
  const lowered = text.toLowerCase();

  const moodLookup: Array<{ mood: string; keys: string[]; query: string }> = [
    { mood: "雨夜", keys: ["雨", "夜", "emo", "伤感"], query: "雨夜 氛围 中文" },
    { mood: "通勤", keys: ["通勤", "开车", "地铁", "上班"], query: "通勤 节奏感 中文流行" },
    { mood: "放松", keys: ["放松", "睡前", "轻", "chill"], query: "放松 轻音乐 人声" },
    { mood: "热血", keys: ["运动", "燃", "能量", "跑步"], query: "热血 节奏 国语" }
  ];

  const matched = moodLookup.find((item) => item.keys.some((key) => lowered.includes(key)));

  const mood = matched?.mood;
  const query = matched?.query ?? text;
  const replyText = mood
    ? `收到，你现在更偏「${mood}」氛围。我先给你挑几首层次感和节奏都在线的歌。`
    : "收到，我先按你这句描述抓情绪关键词，给你来一组贴合场景的歌。";

  return {
    replyText,
    query,
    mood,
    followUp: "你更想要偏人声主导，还是偏氛围器乐？"
  };
}

async function buildPlanWithOpenAI(
  transcript: string,
  context: ConversationTurn[] | undefined,
  apiKey: string,
  model: string,
  fetchImpl: typeof fetch
): Promise<RecommendPlan> {
  const contextText = (context ?? []).slice(-4).map((turn) => `${turn.role}: ${turn.text}`).join("\n");
  const prompt = [
    `用户最新输入：${transcript}`,
    contextText ? `最近上下文：\n${contextText}` : "",
    "请给出最适合音乐检索的关键词。"
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.65,
      max_output_tokens: 280,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: `${MUSIC_AGENT_PERSONA}\n${MUSIC_AGENT_OUTPUT_HINT}` }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: prompt }]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI 响应失败（${response.status}）`);
  }

  const payload = await response.json();
  const text = extractResponseText(payload);
  const jsonText = extractJsonBlock(text);

  if (!jsonText) {
    return heuristicPlan(transcript);
  }

  const parsed = JSON.parse(jsonText) as Partial<RecommendPlan>;

  return {
    replyText: parsed.replyText?.trim() || heuristicPlan(transcript).replyText,
    query: parsed.query?.trim() || transcript,
    mood: parsed.mood?.trim(),
    followUp: parsed.followUp?.trim()
  };
}

function dedupeTracks(tracks: TrackCard[]): TrackCard[] {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    const key = `${track.title.toLowerCase()}|${track.artist.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function recommendFromTranscript(input: RecommendInput): Promise<{
  replyText: string;
  tracks: TrackCard[];
  followUp?: string;
}> {
  const transcript = input.transcript.trim();

  if (!transcript) {
    return {
      replyText: "我在听，你可以直接说场景，比如：雨夜开车、通勤提神、睡前放松。",
      tracks: [],
      followUp: "你现在大概是什么场景？"
    };
  }

  const apiKey = input.openAiApiKey ?? process.env.OPENAI_API_KEY;
  const model = input.model ?? process.env.OPENAI_RESPONSE_MODEL ?? "gpt-4.1-mini";
  const fetchImpl = input.openAiFetch ?? fetch;

  let plan: RecommendPlan;

  if (apiKey) {
    try {
      plan = await buildPlanWithOpenAI(transcript, input.context, apiKey, model, fetchImpl);
    } catch {
      plan = heuristicPlan(transcript);
    }
  } else {
    plan = heuristicPlan(transcript);
  }

  const tracks = dedupeTracks(
    await input.adapter.searchTracks(plan.query || transcript, plan.mood, input.limit ?? 6)
  ).map((track) => ({
    ...track,
    reason: track.reason || (plan.mood ? `这首歌和「${plan.mood}」氛围贴合。` : "这首歌和你刚才的描述比较贴。")
  }));

  return {
    replyText: plan.replyText,
    tracks,
    followUp: plan.followUp
  };
}
