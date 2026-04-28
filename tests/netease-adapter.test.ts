import { describe, expect, it, vi } from "vitest";

import { NeteaseMusicClient, createNeteaseHeaders, createNeteaseSignature } from "@/lib/music/netease";

describe("netease adapter", () => {
  it("creates deterministic signature", () => {
    const payload = "demo-payload";
    const signature = createNeteaseSignature(payload, "secret");
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it("builds signed headers", () => {
    const headers = createNeteaseHeaders({
      appKey: "app-key",
      appSecret: "secret",
      body: "{}",
      timestamp: "123",
      nonce: "abc"
    });

    expect(headers["X-App-Key"]).toBe("app-key");
    expect(headers["X-Timestamp"]).toBe("123");
    expect(headers["X-Nonce"]).toBe("abc");
    expect(headers["X-Signature"]).toBeTypeOf("string");
  });

  it("falls back to mock tracks when request fails and fallback is enabled", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const client = new NeteaseMusicClient({
      baseUrl: "https://example.com",
      useMock: false,
      allowMockFallback: true,
      appKey: "k",
      appSecret: "s",
      fetchImpl
    });

    const tracks = await client.searchTracks("雨夜", "雨夜", 4);
    expect(tracks.length).toBeGreaterThan(0);
    expect(tracks.length).toBeLessThanOrEqual(4);
  });

  it("throws when fallback disabled and remote API fails", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response("bad", { status: 500 });
    }) as unknown as typeof fetch;

    const client = new NeteaseMusicClient({
      baseUrl: "https://example.com",
      useMock: false,
      allowMockFallback: false,
      appKey: "k",
      appSecret: "s",
      fetchImpl
    });

    await expect(client.searchTracks("test")).rejects.toThrow(/网易云接口请求失败/);
  });
});
