import { spawn } from "node:child_process";
import crypto from "node:crypto";

import { searchMockTracks } from "@/lib/music/mock-data";
import type { MusicSearchAdapter, TrackCard } from "@/lib/types";

interface CliExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

type CliRunner = (bin: string, args: string[], timeoutMs: number) => Promise<CliExecResult>;

interface NcmCliConfig {
  cliBin: string;
  useMock: boolean;
  allowMockFallback: boolean;
  timeoutMs: number;
  resolveStreamUrl: boolean;
  runCommand: CliRunner;
}

function getBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === "true";
}

function parseJsonFromText(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const attempts = [trimmed];

  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd !== -1 && objectStart < objectEnd) {
    attempts.push(trimmed.slice(objectStart, objectEnd + 1));
  }

  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd !== -1 && arrayStart < arrayEnd) {
    attempts.push(trimmed.slice(arrayStart, arrayEnd + 1));
  }

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next format
    }
  }

  return null;
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function isLikelyAudioUrl(url: string): boolean {
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
}

function normalizeAudioUrl(value: unknown): string | undefined {
  if (!isHttpUrl(value)) return undefined;
  const url = value.trim();
  return isLikelyAudioUrl(url) ? url : undefined;
}

function findAudioUrlInPayload(payload: unknown): string | undefined {
  if (!payload) return undefined;
  if (isHttpUrl(payload)) return normalizeAudioUrl(payload);
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findAudioUrlInPayload(item);
      if (found) return found;
    }
    return undefined;
  }

  if (typeof payload === "object") {
    const data = payload as Record<string, unknown>;
    const directKeys = [
      "url",
      "playUrl",
      "play_url",
      "streamUrl",
      "stream_url",
      "audioUrl",
      "audio_url",
      "src"
    ];
    for (const key of directKeys) {
      const found = normalizeAudioUrl(data[key]);
      if (found) return found;
    }

    const nestedKeys = ["data", "song", "track", "result"];
    for (const key of nestedKeys) {
      const found = findAudioUrlInPayload(data[key]);
      if (found) return found;
    }
  }

  return undefined;
}

function joinArtists(value: unknown): string {
  if (Array.isArray(value)) {
    return value
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

  if (value && typeof value === "object" && "name" in value && typeof value.name === "string") {
    return value.name;
  }

  if (typeof value === "string") return value;
  return "未知歌手";
}

function toTrack(item: Record<string, any>, mood?: string): TrackCard {
  const id = String(item.id ?? item.songId ?? item.trackId ?? crypto.randomUUID());
  const title = String(item.name ?? item.songName ?? item.title ?? "未命名歌曲");
  const artist = joinArtists(item.artists ?? item.ar ?? item.artist ?? item.singer);
  const albumObj = item.album ?? item.al;
  const album = typeof albumObj === "string" ? albumObj : albumObj?.name;
  const coverUrl = albumObj?.picUrl ?? albumObj?.coverUrl ?? item.coverUrl;

  return {
    id,
    title,
    artist,
    album,
    coverUrl,
    deepLink: `https://music.163.com/#/song?id=${id}`,
    reason: mood ? `这首歌和「${mood}」的听感取向比较贴合。` : "这首歌和你刚刚描述的场景匹配度较高。"
  };
}

function extractItems(payload: unknown): Record<string, any>[] {
  if (Array.isArray(payload)) return payload as Record<string, any>[];
  if (!payload || typeof payload !== "object") return [];

  const data = payload as Record<string, any>;
  const candidates = [
    data.songs,
    data.list,
    data.tracks,
    data.data,
    data.result?.songs,
    data.data?.songs,
    data.data?.list
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as Record<string, any>[];
  }

  return [];
}

function parsePlainLines(text: string, mood?: string, limit = 6): TrackCard[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const tracks: TrackCard[] = [];
  for (const line of lines) {
    const match = line.match(/^\d+[\.\)]?\s*(.+?)\s*-\s*(.+?)(?:\s*\((?:id[:：]?\s*)?(\d+)\))?$/i);
    if (!match) continue;
    const title = match[1].trim();
    const artist = match[2].trim();
    const id = match[3]?.trim() || crypto.createHash("md5").update(`${title}|${artist}`).digest("hex").slice(0, 10);

    tracks.push({
      id,
      title,
      artist,
      deepLink: `https://music.163.com/#/song?id=${id}`,
      reason: mood ? `和「${mood}」氛围接近。` : "与你当前需求相符。"
    });
  }

  return tracks.slice(0, Math.max(1, limit));
}

function createTrackUrlArgs(songId: string): string[][] {
  return [
    ["song", "url", songId, "--json"],
    ["url", songId, "--json"],
    ["play", "url", songId, "--json"],
    ["song", "detail", songId, "--json"],
    ["song", "url", "--id", songId, "--json"]
  ];
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

function createDefaultRunner(): CliRunner {
  return (bin: string, args: string[], timeoutMs: number) =>
    new Promise((resolve, reject) => {
      const child = spawn(bin, args, {
        windowsHide: true,
        env: process.env
      });

      let stdout = "";
      let stderr = "";
      let finished = false;

      const timeout = setTimeout(() => {
        if (finished) return;
        finished = true;
        child.kill();
        reject(new Error(`ncm-cli 执行超时（>${timeoutMs}ms）`));
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });

      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });

      child.on("error", (error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        reject(error);
      });

      child.on("close", (code) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        resolve({ stdout, stderr, code });
      });
    });
}

function createSearchArgs(keyword: string, limit: number): string[][] {
  return [
    ["search", keyword, "--limit", String(limit), "--json"],
    ["search", "--keyword", keyword, "--limit", String(limit), "--json"],
    ["song", "search", keyword, "--limit", String(limit), "--json"],
    ["song", "search", "--keyword", keyword, "--limit", String(limit), "--json"],
    ["search", keyword, "--limit", String(limit)]
  ];
}

export class NcmCliMusicClient implements MusicSearchAdapter {
  private readonly config: NcmCliConfig;

  constructor(config: Partial<NcmCliConfig> = {}) {
    this.config = {
      cliBin: process.env.NCM_CLI_BIN ?? "ncm-cli",
      useMock: getBooleanEnv("NCM_CLI_USE_MOCK", false),
      allowMockFallback: getBooleanEnv("NCM_CLI_ALLOW_MOCK_FALLBACK", true),
      timeoutMs: Number(process.env.NCM_CLI_TIMEOUT_MS ?? 12_000),
      resolveStreamUrl: getBooleanEnv("NCM_CLI_RESOLVE_STREAM_URL", true),
      runCommand: createDefaultRunner(),
      ...config
    };
  }

  private async resolveTrackStreamUrl(songId: string): Promise<string | undefined> {
    const id = songId.trim();
    if (!id) return undefined;

    for (const args of createTrackUrlArgs(id)) {
      try {
        const result = await this.config.runCommand(this.config.cliBin, args, this.config.timeoutMs);
        if (result.code !== 0) continue;

        const parsed = parseJsonFromText(result.stdout);
        if (parsed) {
          const fromJson = findAudioUrlInPayload(parsed);
          if (fromJson) return fromJson;
        }

        const lineUrl = result.stdout.match(/https?:\/\/[^\s"'`]+/i)?.[0];
        if (lineUrl) return lineUrl;
      } catch {
        // try next command
      }
    }

    return undefined;
  }

  async searchTracks(query: string, mood?: string, limit = 6): Promise<TrackCard[]> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [];

    if (this.config.useMock) {
      return searchMockTracks(trimmedQuery, mood, limit);
    }

    const keyword = [trimmedQuery, mood].filter(Boolean).join(" ");
    const errors: string[] = [];

    for (const args of createSearchArgs(keyword, limit)) {
      try {
        const result = await this.config.runCommand(this.config.cliBin, args, this.config.timeoutMs);
        if (result.code !== 0) {
          errors.push(`"${this.config.cliBin} ${args.join(" ")}" exited ${result.code}: ${result.stderr || result.stdout}`);
          continue;
        }

        const parsed = parseJsonFromText(result.stdout);
        let tracks: TrackCard[] = [];

        if (parsed) {
          const items = extractItems(parsed);
          tracks = items.map((item) => toTrack(item, mood));
        } else {
          tracks = parsePlainLines(result.stdout, mood, limit);
        }

        tracks = dedupeTracks(tracks).slice(0, Math.max(1, limit));
        if (this.config.resolveStreamUrl) {
          const withStream = await Promise.all(
            tracks.map(async (track) => {
              if (track.streamUrl) return track;
              const resolved = await this.resolveTrackStreamUrl(track.id);
              return resolved ? { ...track, streamUrl: resolved } : track;
            })
          );
          tracks = withStream;
        }

        if (tracks.length > 0) {
          return tracks;
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "unknown error");
      }
    }

    if (this.config.allowMockFallback) {
      return searchMockTracks(trimmedQuery, mood, limit);
    }

    throw new Error(
      `ncm-cli 搜索失败。请先确认已安装并登录：${this.config.cliBin} -h / ${this.config.cliBin} login。` +
      (errors.length ? ` 详细信息: ${errors.join(" | ")}` : "")
    );
  }
}
