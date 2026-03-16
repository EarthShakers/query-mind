/**
 * ASR 会话管理器：维护 DashScope WebSocket 连接池
 * 支持实时流式音频推送和文本结果回调
 */
import WebSocket from "ws";
import { randomUUID } from "crypto";
import { EventEmitter } from "events";

const DASHSCOPE_BASE_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime";
const SESSION_TTL_MS = 120_000; // 2 分钟无活动自动清理

interface AsrSession {
  ws: WebSocket;
  emitter: EventEmitter;
  timer: ReturnType<typeof setTimeout>;
  ready: boolean;
  readyPromise: Promise<void>;
  /** 等待转写结束的 Promise，resolve 时带上最终文本（可能为空） */
  finishPromise: Promise<string>;
  resolveFinish: (text: string) => void;
}

const sessions = new Map<string, AsrSession>();

function evtId(): string {
  return `evt_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/** 创建新的 ASR 会话，返回 sessionId */
export async function createSession(model: string): Promise<string> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("语音识别服务未配置");

  const sessionId = randomUUID();
  const wsUrl = `${DASHSCOPE_BASE_URL}?model=${encodeURIComponent(model)}`;

  const ws = new WebSocket(wsUrl, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  const emitter = new EventEmitter();
  let resolveReady: () => void;
  const readyPromise = new Promise<void>((r) => {
    resolveReady = r;
  });
  let resolveFinish!: (text: string) => void;
  const finishPromise = new Promise<string>((r) => {
    resolveFinish = r;
  });

  const session: AsrSession = {
    ws,
    emitter,
    timer: setTimeout(() => destroySession(sessionId), SESSION_TTL_MS),
    ready: false,
    readyPromise,
    finishPromise,
    resolveFinish,
  };
  sessions.set(sessionId, session);

  return new Promise<string>((resolve, reject) => {
    ws.on("error", () => {
      if (!session.ready) {
        sessions.delete(sessionId);
        reject(new Error("语音识别服务连接失败"));
      } else {
        emitter.emit("error", "连接断开");
        destroySession(sessionId);
      }
    });

    ws.on("close", () => {
      // session.finished 已经 emit done，这里只做清理
      sessions.delete(sessionId);
    });

    ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        const type = msg?.type as string | undefined;

        console.log("[ASR] event:", type, JSON.stringify(msg).slice(0, 500));

        if (type === "session.created") {
          // 服务端默认配置已满足需求（pcm, 16kHz, server_vad）
          // 仅配置转写语言
          ws.send(
            JSON.stringify({
              event_id: evtId(),
              type: "session.update",
              session: {
                input_audio_transcription: {
                  model,
                  language: "zh",
                },
              },
            })
          );
        } else if (type === "session.updated") {
          session.ready = true;
          resolveReady!();
          resolve(sessionId);
        } else if (
          type === "conversation.item.input_audio_transcription.completed"
        ) {
          const text = msg?.transcript ?? "";
          console.log("[ASR] final text:", text);
          if (text) emitter.emit("text", text);
          session.resolveFinish(text);
        } else if (
          type === "conversation.item.input_audio_transcription.text"
        ) {
          // DashScope 中间结果：text 常为空，实际内容在 stash
          const text = (msg?.stash ?? msg?.text ?? msg?.transcript ?? "") as string;
          console.log("[ASR] partial text:", text);
          if (text) emitter.emit("partial", text);
        } else if (type === "session.finished") {
          emitter.emit("done");
          // 若 completed 未触发（无语音），此处兜底 resolve
          session.resolveFinish("");
          ws.close();
        } else if (type === "error") {
          console.error("[ASR] error:", msg?.error?.message);
          emitter.emit("error", msg?.error?.message ?? "语音识别失败");
        }
      } catch {
        // ignore
      }
    });
  });
}

/** 推送音频块（base64 编码的 PCM） */
export async function pushAudio(
  sessionId: string,
  audioBase64: string
): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("会话不存在");

  // 等待 session ready
  await session.readyPromise;

  if (session.ws.readyState !== WebSocket.OPEN) {
    throw new Error("连接已关闭");
  }

  // 重置超时
  clearTimeout(session.timer);
  session.timer = setTimeout(() => destroySession(sessionId), SESSION_TTL_MS);

  // 检查音频内容是否有效（不全为零）
  const rawBuf = Buffer.from(audioBase64, "base64");
  // 使用 slice 避免 Node Buffer 池导致的 byteOffset 问题，确保正确读取 Int16
  const ab = rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength);
  const samples = new Int16Array(ab);
  let maxAbs = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > maxAbs) maxAbs = abs;
  }
  console.log(
    "[ASR] pushed chunk, base64:", audioBase64.length,
    "bytes:", rawBuf.length,
    "samples:", samples.length,
    "peak:", maxAbs
  );

  session.ws.send(
    JSON.stringify({
      event_id: evtId(),
      type: "input_audio_buffer.append",
      audio: audioBase64,
    })
  );
  console.log("[ASR] pushed audio chunk, base64 length:", audioBase64.length);
}

/** 结束会话，返回转写完成后的最终文本（Promise） */
export async function finishSession(sessionId: string): Promise<string> {
  const session = sessions.get(sessionId);
  if (!session) return "";

  if (session.ws.readyState === WebSocket.OPEN) {
    session.ws.send(JSON.stringify({ event_id: evtId(), type: "session.finish" }));
  }

  try {
    return await Promise.race([
      session.finishPromise,
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("转写超时")), 15_000)
      ),
    ]);
  } catch {
    return "";
  }
}

/** 订阅文本结果 */
export function subscribe(
  sessionId: string,
  handlers: {
    onPartial?: (text: string) => void;
    onText?: (text: string) => void;
    onError?: (msg: string) => void;
    onDone?: () => void;
  }
): () => void {
  const session = sessions.get(sessionId);
  if (!session) {
    handlers.onError?.("会话不存在");
    handlers.onDone?.();
    return () => {};
  }

  const { emitter } = session;
  if (handlers.onPartial) emitter.on("partial", handlers.onPartial);
  if (handlers.onText) emitter.on("text", handlers.onText);
  if (handlers.onError) emitter.on("error", handlers.onError);
  if (handlers.onDone) emitter.on("done", handlers.onDone);

  return () => {
    if (handlers.onPartial) emitter.off("partial", handlers.onPartial);
    if (handlers.onText) emitter.off("text", handlers.onText);
    if (handlers.onError) emitter.off("error", handlers.onError);
    if (handlers.onDone) emitter.off("done", handlers.onDone);
  };
}

/** 销毁会话 */
function destroySession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  clearTimeout(session.timer);
  session.emitter.removeAllListeners();
  session.resolveFinish(""); // 避免 finishPromise 永久挂起
  if (session.ws.readyState === WebSocket.OPEN) {
    session.ws.close();
  }
  sessions.delete(sessionId);
}
