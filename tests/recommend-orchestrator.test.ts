import { describe, expect, it } from "vitest";

import { recommendFromTranscript } from "@/lib/agent/recommend";
import type { MusicSearchAdapter, TrackCard } from "@/lib/types";

const duplicateTracks: TrackCard[] = [
  {
    id: "1",
    title: "雨夜列车",
    artist: "A",
    deepLink: "https://music.163.com/#/song?id=1",
    reason: "适合夜晚"
  },
  {
    id: "2",
    title: "雨夜列车",
    artist: "A",
    deepLink: "https://music.163.com/#/song?id=2",
    reason: "重复项"
  }
];

const adapter: MusicSearchAdapter = {
  async searchTracks() {
    return duplicateTracks;
  }
};

describe("recommend orchestrator", () => {
  it("returns follow-up for empty transcript", async () => {
    const result = await recommendFromTranscript({ transcript: "", adapter });
    expect(result.tracks).toHaveLength(0);
    expect(result.replyText).toContain("我在听");
  });

  it("deduplicates tracks and returns answer", async () => {
    const result = await recommendFromTranscript({
      transcript: "下雨夜里想听点情绪感",
      adapter,
      openAiApiKey: "",
      context: []
    });

    expect(result.replyText.length).toBeGreaterThan(0);
    expect(result.tracks).toHaveLength(1);
  });
});
