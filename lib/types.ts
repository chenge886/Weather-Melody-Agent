export type AgentState = "idle" | "listening" | "thinking" | "speaking";

export interface TrackCard {
  id: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  deepLink: string;
  streamUrl?: string;
  durationSec?: number;
  reason: string;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
}

export interface UserProfileInput {
  location?: string;
  preferencePlaylists?: string[];
  schedule?: string[];
}

export interface WeatherSnapshot {
  locationId: string;
  locationName: string;
  text: string;
  tempC: number;
  humidity: number;
  windDir?: string;
  windScale?: string;
  obsTime?: string;
}

export interface RecommendationMetadata {
  weather?: WeatherSnapshot | null;
  moodTags?: string[];
  playlistQuery?: string;
  scheduleHint?: string;
  modelProvider?: "deepseek" | "fallback";
}

export interface MusicSearchAdapter {
  searchTracks: (query: string, mood?: string, limit?: number) => Promise<TrackCard[]>;
}

export interface AgentRecommendResult {
  replyText: string;
  tracks: TrackCard[];
  followUp?: string;
  metadata?: RecommendationMetadata;
}
