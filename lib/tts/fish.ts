type FetchLike = typeof fetch;

interface FishTtsConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  voiceId?: string;
  format: "mp3" | "wav";
  fetchImpl: FetchLike;
}

interface StreamOptions {
  speed?: number;
}

export class FishTtsClient {
  private readonly config: FishTtsConfig;

  constructor(config: Partial<FishTtsConfig> = {}) {
    this.config = {
      apiKey: process.env.FISH_AUDIO_API_KEY,
      baseUrl: process.env.FISH_AUDIO_BASE_URL ?? "https://api.fish.audio",
      model: process.env.FISH_AUDIO_MODEL ?? "s1",
      voiceId: process.env.FISH_AUDIO_VOICE_ID,
      format: "mp3",
      fetchImpl: fetch,
      ...config
    };
  }

  isConfigured(): boolean {
    return Boolean(this.config.apiKey && this.config.voiceId);
  }

  async *streamSpeech(text: string, options: StreamOptions = {}): AsyncGenerator<Uint8Array> {
    if (!this.config.apiKey || !this.config.voiceId) {
      throw new Error("Fish Audio 未配置，请检查 FISH_AUDIO_API_KEY 与 FISH_AUDIO_VOICE_ID。");
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    const response = await this.config.fetchImpl(new URL("/v1/tts", this.config.baseUrl).toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        text: trimmed,
        reference_id: this.config.voiceId,
        format: this.config.format,
        chunk_length: 180,
        latency: "normal",
        prosody: {
          speed: options.speed ?? 1
        }
      }),
      cache: "no-store"
    });

    if (!response.ok || !response.body) {
      const details = await response.text().catch(() => "");
      throw new Error(`Fish Audio 请求失败（${response.status}）: ${details}`);
    }

    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length > 0) {
        yield value;
      }
    }
  }
}

