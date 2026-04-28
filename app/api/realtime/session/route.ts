import { NextResponse } from "next/server";

import { REALTIME_INSTRUCTIONS } from "@/lib/agent/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "OPENAI_API_KEY 未配置。",
        fallback: true
      },
      { status: 500 }
    );
  }

  const model = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";
  const voice = process.env.OPENAI_VOICE ?? "alloy";

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        voice,
        modalities: ["audio", "text"],
        instructions: REALTIME_INSTRUCTIONS
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Realtime 会话创建失败。",
          details: payload
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      session: payload,
      model,
      voice
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Realtime 会话请求异常。",
        details: error instanceof Error ? error.message : "unknown"
      },
      { status: 500 }
    );
  }
}
