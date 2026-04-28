import { NextResponse } from "next/server";

import { recommendWithProfile } from "@/lib/agent/dj-engine";
import { createMusicSearchAdapter } from "@/lib/music/provider";
import type { ConversationTurn, UserProfileInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RecommendBody {
  transcript?: string;
  context?: ConversationTurn[];
  profile?: UserProfileInput;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RecommendBody;
    const transcript = body.transcript ?? "";

    const client = createMusicSearchAdapter();
    const result = await recommendWithProfile({
      transcript,
      context: body.context,
      profile: body.profile,
      adapter: client
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: "推荐生成失败",
        details: error instanceof Error ? error.message : "unknown"
      },
      { status: 500 }
    );
  }
}
