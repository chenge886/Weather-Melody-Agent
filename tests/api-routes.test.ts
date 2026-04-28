import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as recommendPOST } from "@/app/api/agent/recommend/route";
import { POST as livePOST } from "@/app/api/agent/live/route";
import { POST as musicSearchPOST } from "@/app/api/music/search/route";
import { POST as realtimePOST } from "@/app/api/realtime/session/route";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api routes", () => {
  it("search route returns tracks", async () => {
    process.env.MUSIC_PROVIDER = "cli";
    process.env.NCM_CLI_USE_MOCK = "true";

    const request = new Request("http://localhost/api/music/search", {
      method: "POST",
      body: JSON.stringify({ query: "雨夜", limit: 3 })
    });

    const response = await musicSearchPOST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.tracks.length).toBeGreaterThan(0);
  });

  it("recommend route returns text and tracks", async () => {
    process.env.MUSIC_PROVIDER = "cli";
    process.env.NCM_CLI_USE_MOCK = "true";

    const request = new Request("http://localhost/api/agent/recommend", {
      method: "POST",
      body: JSON.stringify({ transcript: "想听通勤提神的" })
    });

    const response = await recommendPOST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(typeof payload.replyText).toBe("string");
    expect(Array.isArray(payload.tracks)).toBe(true);
  });

  it("live route returns stream error when transcript missing", async () => {
    const request = new Request("http://localhost/api/agent/live", {
      method: "POST",
      body: JSON.stringify({})
    });

    const response = await livePOST(request);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain("transcript 不能为空");
  });

  it("realtime route surfaces missing key", async () => {
    const response = await realtimePOST();
    expect(response.status).toBe(500);
  });

  it("realtime route returns session when provider succeeds", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ id: "sess_123", client_secret: { value: "abc" } }), { status: 200 }))
    );

    const response = await realtimePOST();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.session.id).toBe("sess_123");
  });
});
