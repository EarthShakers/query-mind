import { NextRequest, NextResponse } from "next/server";
import { getModelConfig } from "@/lib/llm/model-config";
import {
  createSession,
  pushAudio,
  finishSession,
  subscribe,
} from "@/lib/asr/session-manager";

/**
 * POST /api/asr
 * body: { action: "start" } → { sessionId }
 * body: { action: "push", sessionId, audio } → { ok: true }
 * body: { action: "stop", sessionId } → { ok: true }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "start") {
      const config = await getModelConfig();
      const sessionId = await createSession(config.modelAsr);
      return NextResponse.json({ sessionId });
    }

    if (action === "push") {
      const { sessionId, audio } = body;
      if (!sessionId || !audio) {
        return NextResponse.json({ error: "缺少参数" }, { status: 400 });
      }
      await pushAudio(sessionId, audio);
      return NextResponse.json({ ok: true });
    }

    if (action === "stop") {
      const { sessionId } = body;
      if (!sessionId) {
        return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
      }
      finishSession(sessionId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "未知 action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "语音识别服务异常";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/asr?sessionId=xxx
 * SSE 流式返回转写文本
 */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (event: string, data: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      };

      const close = () => {
        if (closed) return;
        closed = true;
        unsub();
        controller.close();
      };

      const unsub = subscribe(sessionId, {
        onPartial: (text) => send("partial", JSON.stringify({ text })),
        onText: (text) => send("text", JSON.stringify({ text })),
        onError: (msg) => {
          send("error", JSON.stringify({ error: msg }));
          close();
        },
        onDone: () => {
          send("done", "{}");
          close();
        },
      });

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
