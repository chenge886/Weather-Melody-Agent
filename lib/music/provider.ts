import { searchMockTracks } from "@/lib/music/mock-data";
import { NcmCliMusicClient } from "@/lib/music/ncm-cli";
import { NeteaseMusicClient } from "@/lib/music/netease";
import type { MusicSearchAdapter } from "@/lib/types";

function createMockAdapter(): MusicSearchAdapter {
  return {
    async searchTracks(query: string, mood?: string, limit = 6) {
      return searchMockTracks(query, mood, limit);
    }
  };
}

export function createMusicSearchAdapter(): MusicSearchAdapter {
  const provider = (process.env.MUSIC_PROVIDER ?? "cli").trim().toLowerCase();

  if (provider === "mock") return createMockAdapter();
  if (provider === "openapi") return new NeteaseMusicClient();

  return new NcmCliMusicClient();
}

