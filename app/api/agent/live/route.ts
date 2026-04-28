import { streamDjSession } from "@/lib/agent/dj-engine";
import { createMusicSearchAdapter } from "@/lib/music/provider";
import type { ConversationTurn, UserProfileInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LiveBody {
  transcript?: string;
  context?: ConversationTurn[];
  profile?: UserProfileInput;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as LiveBody;
  const transcript = body.transcript?.trim() ?? "";
  const adapter = createMusicSearchAdapter();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const write = (payload: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      if (!transcript) {
        write({
          event: "error",
          data: {
            message: "transcript 不能为空"
          }
        });
        controller.close();
        return;
      }

      try {
        for await (const event of streamDjSession({
          transcript,
          context: body.context,
          profile: body.profile,
          adapter
        })) {
          write(event);
        }
      } catch (error) {
        write({
          event: "error",
          data: {
            message: error instanceof Error ? error.message : "stream failed"
          }
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

