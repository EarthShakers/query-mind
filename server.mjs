/**
 * Custom Next.js server with WebSocket support for ASR streaming.
 *
 * Adds a WebSocket endpoint at /api/asr-ws that replaces the HTTP POST + SSE
 * pattern for lower-latency audio streaming.
 */
import { createServer } from "node:http";
import { parse } from "node:url";
import { randomUUID } from "node:crypto";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev });
const handle = app.getRequestHandler();

// ── DashScope ASR constants ──
const DASHSCOPE_BASE_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime";
const DASHSCOPE_CHAT_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const SESSION_TTL_MS = 120_000;

/** LLM 纠错：使用 getModelConfig().modelLight */
async function correctAsrText(rawText) {
  if (!rawText?.trim()) return rawText;
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) return rawText;
  try {
    const { getModelConfig } = await import("./src/lib/llm/model-config.ts");
    const config = await getModelConfig();
    const model = config.modelLight;
    const res = await fetch(DASHSCOPE_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "你是语音识别纠错助手。将用户输入的语音识别文本进行纠错（同音字、漏字、标点等），只输出纠错后的文本，不要解释或多余内容。若无明显错误则原样输出。",
          },
          { role: "user", content: rawText },
        ],
        max_tokens: 256,
        temperature: 0.1,
      }),
    });
    const data = await res.json();
    const corrected = data?.choices?.[0]?.message?.content?.trim();
    return corrected || rawText;
  } catch (err) {
    if (dev) console.warn("[ASR-WS] LLM 纠错失败:", err.message);
    return rawText;
  }
}

function evtId() {
  return `evt_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/**
 * Per-client state: tracks the upstream DashScope WebSocket and relay logic.
 * Completely independent of session-manager.ts (used by the HTTP fallback route).
 */
function handleAsrWebSocket(clientWs) {
  /** @type {WebSocket | null} */
  let dashWs = null;
  let timer = null;
  let ready = false;
  /** 最后一次 ASR 完整输出，用于 session.finished 时 LLM 纠错 */
  let lastCompletedText = "";
  /** Queue of messages received before DashScope is ready */
  const pendingQueue = [];

  const resetTimer = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      sendToClient("error", { error: "会话超时" });
      cleanup();
    }, SESSION_TTL_MS);
  };

  const sendToClient = (type, payload = {}) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type, ...payload }));
    }
  };

  const cleanup = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (dashWs && dashWs.readyState === WebSocket.OPEN) {
      try { dashWs.close(); } catch { /* ignore */ }
    }
    dashWs = null;
    ready = false;
    pendingQueue.length = 0;
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
    }
  };

  const flushPending = () => {
    for (const msg of pendingQueue) {
      handleClientMessage(msg);
    }
    pendingQueue.length = 0;
  };

  /** Connect to DashScope Realtime ASR */
  const startSession = () => {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      sendToClient("error", { error: "语音识别服务未配置" });
      return;
    }

    const model = process.env.MODEL_ASR || "qwen3-asr-flash-realtime";
    const wsUrl = `${DASHSCOPE_BASE_URL}?model=${encodeURIComponent(model)}`;

    dashWs = new WebSocket(wsUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    dashWs.on("error", (err) => {
      console.error("[ASR-WS] DashScope error:", err.message);
      if (!ready) {
        sendToClient("error", { error: "语音识别服务连接失败" });
        cleanup();
      } else {
        sendToClient("error", { error: "连接断开" });
        cleanup();
      }
    });

    dashWs.on("close", () => {
      // DashScope closed — if we haven't sent "done" yet, send it
      dashWs = null;
    });

    dashWs.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const type = msg?.type;

        if (dev) {
          console.log("[ASR-WS] DashScope event:", type, JSON.stringify(msg).slice(0, 300));
        }

        if (type === "session.created") {
          dashWs.send(JSON.stringify({
            event_id: evtId(),
            type: "session.update",
            session: {
              input_audio_transcription: { model: process.env.MODEL_ASR || "qwen3-asr-flash-realtime", language: "zh" },
            },
          }));
        } else if (type === "session.updated") {
          ready = true;
          resetTimer();
          sendToClient("started", { sessionId: randomUUID() });
          flushPending();
        } else if (type === "conversation.item.input_audio_transcription.completed") {
          const text = msg?.transcript ?? "";
          if (dev) console.log("[ASR-WS] final text:", text);
          if (text) {
            lastCompletedText = text;
            sendToClient("text", { text });
          }
        } else if (type === "conversation.item.input_audio_transcription.text") {
          const text = (msg?.stash ?? msg?.text ?? msg?.transcript ?? "");
          if (text) sendToClient("partial", { text });
        } else if (type === "session.finished") {
          const doLlmCorrect = process.env.ASR_LLM_CORRECT !== "false";
          if (doLlmCorrect && lastCompletedText.trim()) {
            (async () => {
              try {
                const corrected = await correctAsrText(lastCompletedText);
                if (corrected && corrected !== lastCompletedText) {
                  sendToClient("text_corrected", { text: corrected });
                }
              } catch { /* ignore */ }
              sendToClient("done");
              cleanup();
            })();
          } else {
            sendToClient("done");
            cleanup();
          }
          return;
        } else if (type === "error") {
          console.error("[ASR-WS] DashScope error event:", msg?.error?.message);
          sendToClient("error", { error: msg?.error?.message ?? "语音识别失败" });
        }
      } catch { /* ignore parse errors */ }
    });
  };

  const handleClientMessage = (msg) => {
    if (msg.type === "start") {
      startSession();
      return;
    }

    // Queue messages if DashScope not ready yet
    if (!ready && msg.type !== "start") {
      pendingQueue.push(msg);
      return;
    }

    if (msg.type === "push") {
      if (!dashWs || dashWs.readyState !== WebSocket.OPEN) return;
      resetTimer();
      dashWs.send(JSON.stringify({
        event_id: evtId(),
        type: "input_audio_buffer.append",
        audio: msg.audio,
      }));
    } else if (msg.type === "push_binary") {
      // Binary audio path: msg.pcmBuffer is an ArrayBuffer/Buffer
      if (!dashWs || dashWs.readyState !== WebSocket.OPEN) return;
      resetTimer();
      // Convert binary PCM to base64 for DashScope
      const base64 = Buffer.from(msg.pcmBuffer).toString("base64");
      dashWs.send(JSON.stringify({
        event_id: evtId(),
        type: "input_audio_buffer.append",
        audio: base64,
      }));
    } else if (msg.type === "stop") {
      if (dashWs && dashWs.readyState === WebSocket.OPEN) {
        dashWs.send(JSON.stringify({ event_id: evtId(), type: "session.finish" }));
      }
    }
  };

  clientWs.on("message", (data, isBinary) => {
    if (isBinary) {
      // Binary frame: raw PCM audio data
      handleClientMessage({ type: "push_binary", pcmBuffer: data });
      return;
    }
    try {
      const msg = JSON.parse(data.toString());
      handleClientMessage(msg);
    } catch {
      // ignore malformed JSON
    }
  });

  clientWs.on("close", () => {
    // Client disconnected — tear down DashScope connection
    if (dashWs && dashWs.readyState === WebSocket.OPEN) {
      try {
        dashWs.send(JSON.stringify({ event_id: evtId(), type: "session.finish" }));
      } catch { /* ignore */ }
    }
    if (timer) clearTimeout(timer);
    timer = null;
  });

  clientWs.on("error", () => {
    cleanup();
  });
}

// ── Boot ──
app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // WebSocket server in noServer mode
  const wss = new WebSocketServer({ noServer: true });

  // Next.js upgrade handler for HMR WebSocket in dev mode
  const nextUpgradeHandler = app.getUpgradeHandler();

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url, true);
    if (pathname === "/api/asr-ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      // Delegate to Next.js (HMR WebSocket, etc.)
      nextUpgradeHandler(req, socket, head);
    }
  });

  wss.on("connection", (ws) => {
    handleAsrWebSocket(ws);
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
