import { describe, expect, it, vi } from "vitest";

import { NcmCliMusicClient } from "@/lib/music/ncm-cli";

describe("ncm-cli adapter", () => {
  it("parses JSON output to tracks", async () => {
    const runCommand = vi.fn(async () => ({
      code: 0,
      stdout: JSON.stringify({
        songs: [
          { id: 123, name: "晴天", artists: [{ name: "周杰伦" }] }
        ]
      }),
      stderr: ""
    }));

    const client = new NcmCliMusicClient({
      runCommand,
      useMock: false,
      allowMockFallback: false
    });

    const tracks = await client.searchTracks("晴天", "轻松", 3);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].title).toBe("晴天");
    expect(tracks[0].artist).toContain("周杰伦");
  });

  it("falls back to mock tracks on CLI failure when enabled", async () => {
    const runCommand = vi.fn(async () => {
      throw new Error("ENOENT");
    });

    const client = new NcmCliMusicClient({
      runCommand,
      useMock: false,
      allowMockFallback: true
    });

    const tracks = await client.searchTracks("雨夜", "雨天", 4);
    expect(tracks.length).toBeGreaterThan(0);
    expect(tracks.length).toBeLessThanOrEqual(4);
  });

  it("throws when CLI fails and fallback is disabled", async () => {
    const runCommand = vi.fn(async () => ({
      code: 1,
      stdout: "",
      stderr: "not logged in"
    }));

    const client = new NcmCliMusicClient({
      runCommand,
      useMock: false,
      allowMockFallback: false
    });

    await expect(client.searchTracks("test")).rejects.toThrow(/ncm-cli 搜索失败/);
  });
});

