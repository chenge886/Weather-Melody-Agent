import crypto from "node:crypto";

import { searchMockTracks } from "@/lib/music/mock-data";
import type { TrackCard } from "@/lib/types";

type FetchLike = typeof fetch;

export interface NeteaseClientConfig {
  baseUrl: string;
  searchPath: string;
  detailPath: string;
  appKey?: string;
  appSecret?: string;
  accessToken?: string;
  useMock: boolean;
  allowMockFallback: boolean;
  fetchImpl: FetchLike;
}

interface HeaderInput {
  appKey: string;
  appSecret: string;
  body: string;
  timestamp: string;
  nonce: string;
}

export function createNeteaseSignature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function createNeteaseHeaders(input: HeaderInput): Record<string, string> {
  const payload = `${input.appKey}:${input.timestamp}:${input.nonce}:${input.body}`;
  const signature = createNeteaseSignature(payload, input.appSecret);

  return {
    "X-App-Key": input.appKey,
    "X-Timestamp": input.timestamp,
    "X-Nonce": input.nonce,
    "X-Signature": signature
  };
}

function getBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === "true";
}

function joinArtistNames(artists: unknown): string {
  if (Array.isArray(artists)) {
    return artists
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "name" in item && typeof item.name === "string") {
          return item.name;
        }
        return "";
      })
      .filter(Boolean)
      .join(" / ");
  }

  if (typeof artists === "string") return artists;
  return "未知歌手";
}

function extractPlayableUrl(item: Record<string, any>): string | undefined {
  const isLikelyAudio = (url: string): boolean => {
    const value = url.toLowerCase();
    return (
      value.includes(".mp3") ||
      value.includes(".m4a") ||
      value.includes(".flac") ||
      value.includes(".wav") ||
      value.includes(".aac") ||
      value.includes(".ogg") ||
      value.includes("audio") ||
      value.includes("/media/") ||
      value.includes("song/url")
    );
  };

  const candidates = [
    item.url,
    item.playUrl,
    item.play_url,
    item.audioUrl,
    item.audio_url,
    item.sourceUrl,
    item.song?.url,
    item.data?.url,
    item.data?.[0]?.url
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && /^https?:\/\//i.test(candidate.trim())) {
      const url = candidate.trim();
      if (isLikelyAudio(url)) return url;
    }
  }

  return undefined;
}

function normalizeTrack(item: Record<string, any>, mood?: string): TrackCard {
  const id = String(item.id ?? item.songId ?? item.trackId ?? crypto.randomUUID());
  const title = String(item.name ?? item.songName ?? item.title ?? "未命名歌曲");
  const artist = joinArtistNames(item.artists ?? item.ar ?? item.artist);
  const albumObj = item.album ?? item.al ?? item.song?.album;
  const album = typeof albumObj === "string" ? albumObj : albumObj?.name;
  const coverUrl = albumObj?.picUrl ?? albumObj?.coverUrl ?? item.coverUrl;
  const streamUrl = extractPlayableUrl(item);

  return {
    id,
    title,
    artist,
    album,
    coverUrl,
    deepLink: `https://music.163.com/#/song?id=${id}`,
    streamUrl,
    reason: mood ? `和「${mood}」氛围匹配，旋律与情绪落点比较贴合。` : "旋律和节奏平衡，适合当前场景循环播放。"
  };
}

function extractSongItems(payload: any): Record<string, any>[] {
  const candidates = [
    payload?.result?.songs,
    payload?.songs,
    payload?.data?.songs,
    payload?.data?.list,
    payload?.data
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as Record<string, any>[];
  }

  return [];
}

function dedupeTracks(tracks: TrackCard[]): TrackCard[] {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    const key = `${track.title.trim().toLowerCase()}::${track.artist.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class NeteaseMusicClient {
  private readonly config: NeteaseClientConfig;

  constructor(config: Partial<NeteaseClientConfig> = {}) {
    this.config = {
      baseUrl: process.env.NETEASE_BASE_URL ?? "",
      searchPath: process.env.NETEASE_SEARCH_PATH ?? "/api/song/search",
      detailPath: process.env.NETEASE_DETAIL_PATH ?? "/api/song/detail",
      appKey: process.env.NETEASE_APP_KEY,
      appSecret: process.env.NETEASE_APP_SECRET,
      accessToken: process.env.NETEASE_ACCESS_TOKEN,
      useMock: getBooleanEnv("NETEASE_USE_MOCK", true),
      allowMockFallback: getBooleanEnv("NETEASE_ALLOW_MOCK_FALLBACK", true),
      fetchImpl: fetch,
      ...config
    };
  }

  async searchTracks(query: string, mood?: string, limit = 6): Promise<TrackCard[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    if (this.config.useMock) {
      return searchMockTracks(trimmed, mood, limit);
    }

    try {
      const searchResult = await this.requestJson(this.config.searchPath, {
        query: trimmed,
        keyword: trimmed,
        mood,
        limit
      });

      const songs = extractSongItems(searchResult);
      let tracks = dedupeTracks(songs.map((song) => normalizeTrack(song, mood))).slice(0, limit);

      if (tracks.length > 0) {
        const detailResult = await this.requestJson(this.config.detailPath, {
          ids: tracks.map((track) => track.id)
        });

        const detailedSongs = extractSongItems(detailResult);
        const detailedMap = new Map(detailedSongs.map((song) => {
          const normalized = normalizeTrack(song, mood);
          return [normalized.id, normalized] as const;
        }));

        tracks = tracks.map((track) => detailedMap.get(track.id) ?? track);
      }

      if (tracks.length === 0 && this.config.allowMockFallback) {
        return searchMockTracks(trimmed, mood, limit);
      }

      return tracks;
    } catch (error) {
      if (this.config.allowMockFallback) {
        return searchMockTracks(trimmed, mood, limit);
      }

      throw error;
    }
  }

  private async requestJson(path: string, body: Record<string, unknown>): Promise<any> {
    if (!this.config.baseUrl) {
      throw new Error("NETEASE_BASE_URL 未设置，无法调用官方接口。");
    }

    if (!this.config.accessToken && (!this.config.appKey || !this.config.appSecret)) {
      throw new Error("网易云鉴权信息缺失，请设置 NETEASE_ACCESS_TOKEN 或 NETEASE_APP_KEY/NETEASE_APP_SECRET。");
    }

    const payload = JSON.stringify(body);
    const url = path.startsWith("http") ? path : new URL(path, this.config.baseUrl).toString();
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();

    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (this.config.accessToken) {
      headers.Authorization = `Bearer ${this.config.accessToken}`;
    }

    if (this.config.appKey && this.config.appSecret) {
      Object.assign(
        headers,
        createNeteaseHeaders({
          appKey: this.config.appKey,
          appSecret: this.config.appSecret,
          body: payload,
          timestamp,
          nonce
        })
      );
    }

    const response = await this.config.fetchImpl(url, {
      method: "POST",
      headers,
      body: payload,
      cache: "no-store"
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`网易云接口请求失败（${response.status}）: ${details}`);
    }

    return response.json();
  }
}
