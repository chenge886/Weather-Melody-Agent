type FetchLike = typeof fetch;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface DeepSeekConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  fetchImpl: FetchLike;
}

interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
}

function buildRequestBody(messages: ChatMessage[], options: CompletionOptions, stream: boolean) {
  return {
    messages,
    stream,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 700
  };
}

function getDeltaText(payload: any): string {
  if (!payload?.choices || !Array.isArray(payload.choices) || payload.choices.length === 0) {
    return "";
  }

  const first = payload.choices[0];
  if (typeof first?.delta?.content === "string") return first.delta.content;
  if (typeof first?.message?.content === "string") return first.message.content;
  return "";
}

export class DeepSeekClient {
  private readonly config: DeepSeekConfig;

  constructor(config: Partial<DeepSeekConfig> = {}) {
    this.config = {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      fetchImpl: fetch,
      ...config
    };
  }

  isConfigured(): boolean {
    return Boolean(this.config.apiKey);
  }

  async complete(messages: ChatMessage[], options: CompletionOptions = {}): Promise<string> {
    if (!this.config.apiKey) {
      throw new Error("DEEPSEEK_API_KEY 未配置。");
    }

    const url = new URL("/chat/completions", this.config.baseUrl).toString();
    const response = await this.config.fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        ...buildRequestBody(messages, options, false),
        model: this.config.model
      }),
      cache: "no-store"
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`DeepSeek completion failed (${response.status}): ${details}`);
    }

    const payload = await response.json();
    return getDeltaText(payload);
  }

  async *stream(messages: ChatMessage[], options: CompletionOptions = {}): AsyncGenerator<string> {
    if (!this.config.apiKey) {
      throw new Error("DEEPSEEK_API_KEY 未配置。");
    }

    const url = new URL("/chat/completions", this.config.baseUrl).toString();
    const response = await this.config.fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        ...buildRequestBody(messages, options, true),
        model: this.config.model
      }),
      cache: "no-store"
    });

    if (!response.ok || !response.body) {
      const details = await response.text().catch(() => "");
      throw new Error(`DeepSeek stream failed (${response.status}): ${details}`);
    }

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let lineBreak = buffer.indexOf("\n");
      while (lineBreak !== -1) {
        const rawLine = buffer.slice(0, lineBreak).trim();
        buffer = buffer.slice(lineBreak + 1);
        lineBreak = buffer.indexOf("\n");

        if (!rawLine.startsWith("data:")) continue;
        const data = rawLine.slice(5).trim();
        if (!data || data === "[DONE]") continue;

        try {
          const payload = JSON.parse(data);
          const delta = getDeltaText(payload);
          if (delta) yield delta;
        } catch {
          // Ignore malformed event chunks
        }
      }
    }

    const tail = buffer.trim();
    if (tail.startsWith("data:")) {
      const data = tail.slice(5).trim();
      if (data && data !== "[DONE]") {
        try {
          const payload = JSON.parse(data);
          const delta = getDeltaText(payload);
          if (delta) yield delta;
        } catch {
          // ignore
        }
      }
    }
  }
}
