import { NextResponse } from "next/server";

import { createMusicSearchAdapter } from "@/lib/music/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SearchBody {
  query?: string;
  mood?: string;
  limit?: number;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SearchBody;
    const query = body.query?.trim();

    if (!query) {
      return NextResponse.json({ error: "query 不能为空" }, { status: 400 });
    }

    const limit = Math.min(Math.max(body.limit ?? 6, 1), 12);
    const client = createMusicSearchAdapter();
    const tracks = await client.searchTracks(query, body.mood, limit);

    return NextResponse.json({ tracks });
  } catch (error) {
    return NextResponse.json(
      {
        error: "音乐搜索失败",
        details: error instanceof Error ? error.message : "unknown"
      },
      { status: 500 }
    );
  }
}
