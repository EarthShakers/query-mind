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
const DASHSCOPE_INTL_BASE_URL =
  "wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime";
const DASHSCOPE_CHAT_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const SESSION_TTL_MS = 120_000;
const ASYNC_CORRECT_TIMEOUT_MS = 3500;
const TTS_SAMPLE_RATE = 24000;

async function correctAsrText(rawText) {
  if (!rawText?.trim()) return rawText;
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) return rawText;
  try {
    const model = process.env.MODEL_LIGHT || "qwen-max";
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
              "你是语音识别纠错助手。仅修正明显的同音字、漏字、标点错误，只输出纠错后的文本，不要解释。若不确定或可能改变原意（如专有名词、数字、医疗/业务术语），务必原样输出，切勿臆测改写。",
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

function splitTtsTextIntoChunks(text, maxChunkLength = 40) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const sentenceLikeParts =
    normalized.match(/[^。！？!?；;，,]+[。！？!?；;，,]*/g) || [normalized];
  const chunks = [];
  let current = "";

  const pushChunk = (value) => {
    const trimmed = String(value || "").trim();
    if (trimmed) chunks.push(trimmed);
  };

  for (const part of sentenceLikeParts) {
    const trimmed = String(part || "").trim();
    if (!trimmed) continue;

    if ((current + trimmed).length <= maxChunkLength) {
      current += trimmed;
      continue;
    }

    pushChunk(current);
    current = "";

    if (trimmed.length <= maxChunkLength) {
      current = trimmed;
      continue;
    }

    for (let i = 0; i < trimmed.length; i += maxChunkLength) {
      pushChunk(trimmed.slice(i, i + maxChunkLength));
    }
  }

  pushChunk(current);
  return chunks;
}

function getRealtimeTtsModelCandidates(preferredModel, voice) {
  const candidates = [];
  const add = (model) => {
    if (model && !candidates.includes(model)) candidates.push(model);
  };

  const model = String(preferredModel || "").trim();
  const normalizedVoice = String(voice || "").trim();
  const usesSystemVoice = !normalizedVoice || normalizedVoice === "Cherry";

  if (model.includes("realtime")) {
    add(model);
  }
  if (model.includes("instruct")) {
    add("qwen3-tts-instruct-flash-realtime");
  }
  if (model.includes("vd") && !usesSystemVoice) {
    add("qwen3-tts-vd-realtime-2026-01-15");
  }
  if (model.includes("vc") && !usesSystemVoice) {
    add("qwen3-tts-vc-realtime-2026-01-15");
  }

  add("qwen3-tts-flash-realtime");
  add("qwen-tts-realtime-latest");

  return candidates;
}

function handleTtsWebSocket(clientWs) {
  let dashWs = null;
  let cleaned = false;
  let started = false;
  let sessionFinished = false;

  const sendToClient = (payload) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(payload));
    }
  };

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (dashWs) {
      try {
        dashWs.close();
      } catch {
        /* ignore */
      }
    }
    dashWs = null;
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
    }
  };

  const startTtsSession = ({ text, voice, model }) => {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      sendToClient({ type: "error", error: "语音合成服务未配置" });
      return;
    }

    const normalizedText = String(text || "").trim();
    if (!normalizedText) {
      sendToClient({ type: "error", error: "缺少 text" });
      return;
    }

    const normalizedVoice = String(voice || "Cherry").trim() || "Cherry";
    const modelCandidates = getRealtimeTtsModelCandidates(
      model || process.env.MODEL_TTS || "",
      normalizedVoice
    );
    const useIntl = /intl|singapore/i.test(process.env.DASHSCOPE_BASE_URL || "");
    const baseUrl = useIntl ? DASHSCOPE_INTL_BASE_URL : DASHSCOPE_BASE_URL;
    const textChunks = splitTtsTextIntoChunks(normalizedText);
    let candidateIndex = 0;

    const connectWithCandidate = () => {
      if (candidateIndex >= modelCandidates.length) {
        sendToClient({ type: "error", error: "实时语音合成连接失败" });
        return;
      }

      const currentModel = modelCandidates[candidateIndex];
      const wsUrl = `${baseUrl}?model=${encodeURIComponent(currentModel)}`;

      dashWs = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "OpenAI-Beta": "realtime=v1",
        },
      });

      dashWs.on("open", () => {
        started = false;
        sessionFinished = false;
      });

      dashWs.on("error", (err) => {
        if (!started) {
          candidateIndex += 1;
          try {
            dashWs.close();
          } catch {
            /* ignore */
          }
          dashWs = null;
          connectWithCandidate();
          return;
        }
        console.error("[TTS-WS] DashScope error:", err.message);
        sessionFinished = true;
        sendToClient({ type: "error", error: "实时语音合成连接中断" });
      });

      dashWs.on("close", () => {
        if (started && !sessionFinished && clientWs.readyState === WebSocket.OPEN) {
          sendToClient({ type: "done" });
        }
      });

      dashWs.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          const type = msg?.type;

          if (dev) {
            console.log(
              "[TTS-WS] DashScope event:",
              type,
              JSON.stringify(msg).slice(0, 300)
            );
          }

          if (type === "session.created") {
            dashWs.send(
              JSON.stringify({
                event_id: evtId(),
                type: "session.update",
                session: {
                  voice: normalizedVoice,
                  mode: "server_commit",
                  language_type: "Chinese",
                  response_format: "pcm",
                  sample_rate: TTS_SAMPLE_RATE,
                },
              })
            );
          } else if (type === "session.updated") {
            started = true;
            sendToClient({
              type: "started",
              model: currentModel,
              voice: normalizedVoice,
              sampleRate: TTS_SAMPLE_RATE,
            });
            for (const chunk of textChunks) {
              dashWs.send(
                JSON.stringify({
                  event_id: evtId(),
                  type: "input_text_buffer.append",
                  text: chunk,
                })
              );
            }
            dashWs.send(
              JSON.stringify({
                event_id: evtId(),
                type: "input_text_buffer.commit",
              })
            );
            dashWs.send(
              JSON.stringify({
                event_id: evtId(),
                type: "session.finish",
              })
            );
          } else if (type === "response.audio.delta") {
            sendToClient({
              type: "audio",
              delta: msg?.delta,
              sampleRate: TTS_SAMPLE_RATE,
            });
          } else if (type === "response.done") {
            sendToClient({ type: "response_done" });
          } else if (type === "session.finished") {
            sessionFinished = true;
            sendToClient({ type: "done" });
            if (dashWs && dashWs.readyState === WebSocket.OPEN) {
              dashWs.close();
            }
          } else if (type === "error") {
            if (!started) {
              candidateIndex += 1;
              try {
                dashWs.close();
              } catch {
                /* ignore */
              }
              dashWs = null;
              connectWithCandidate();
              return;
            }
            console.error("[TTS-WS] DashScope error event:", msg?.error?.message);
            sessionFinished = true;
            sendToClient({
              type: "error",
              error: msg?.error?.message ?? "实时语音合成失败",
            });
          }
        } catch (err) {
          console.error("[TTS-WS] parse error:", err?.message || err);
        }
      });
    };

    connectWithCandidate();
  };

  clientWs.on("message", (data, isBinary) => {
    if (isBinary) return;
    try {
      const msg = JSON.parse(data.toString());
      if (msg?.type === "start") {
        startTtsSession(msg);
      } else if (msg?.type === "stop") {
        sessionFinished = true;
        cleanup();
      }
    } catch {
      /* ignore malformed JSON */
    }
  });

  clientWs.on("close", () => {
    sessionFinished = true;
    if (dashWs && dashWs.readyState === WebSocket.OPEN) {
      try {
        dashWs.close();
      } catch {
        /* ignore */
      }
    }
  });

  clientWs.on("error", () => {
    cleanup();
  });
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
  let cleaned = false;
  /** 当前是否处于一次可识别的会话中（收到 started 后为 true，直到发送 done） */
  let utteranceLive = false;
  let lastCompletedText = "";
  /** Queue of messages received before DashScope is ready */
  const pendingQueue = [];

  const resetDashSession = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (dashWs) {
      try {
        if (dashWs.readyState === WebSocket.OPEN) {
          dashWs.close();
        }
      } catch {
        /* ignore */
      }
    }
    dashWs = null;
    ready = false;
    pendingQueue.length = 0;
    lastCompletedText = "";
  };

  const resetTimer = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      sendToClient("error", { error: "会话超时" });
      utteranceLive = false;
      resetDashSession();
    }, SESSION_TTL_MS);
  };

  const sendToClient = (type, payload = {}) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type, ...payload }));
    }
  };

  /** 关闭客户端连接（页面卸载、致命错误） */
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    utteranceLive = false;
    resetDashSession();
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

  /**
   * 一次识别结束：通知客户端 done，断开上游 DashScope，保留浏览器 WebSocket 供下一轮 start。
   */
  const finalizeSession = () => {
    if (!utteranceLive) return;
    utteranceLive = false;
    sendToClient("done");
    const snapshot = lastCompletedText;
    resetDashSession();

    const doLlmCorrect = process.env.ASR_LLM_CORRECT !== "false";
    if (!doLlmCorrect || !snapshot.trim()) {
      return;
    }

    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve(snapshot), ASYNC_CORRECT_TIMEOUT_MS);
    });

    Promise.race([correctAsrText(snapshot), timeoutPromise])
      .then((corrected) => {
        if (
          typeof corrected === "string" &&
          corrected.trim() &&
          corrected !== snapshot &&
          clientWs.readyState === WebSocket.OPEN
        ) {
          sendToClient("text_corrected", {
            text: corrected,
            sourceText: snapshot,
          });
        }
      })
      .catch(() => {});
  };

  /** Connect to DashScope Realtime ASR */
  const startSession = () => {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      sendToClient("error", { error: "语音识别服务未配置" });
      return;
    }

    utteranceLive = false;

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
        utteranceLive = false;
        resetDashSession();
      } else {
        sendToClient("error", { error: "连接断开" });
        utteranceLive = false;
        resetDashSession();
      }
    });

    dashWs.on("close", () => {
      const wasReady = ready;
      dashWs = null;
      ready = false;
      // DashScope 意外断开：若本轮仍在识别中，补发 done 并清理上游
      if (wasReady && utteranceLive && clientWs.readyState === WebSocket.OPEN) {
        finalizeSession();
      }
    });

    dashWs.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const type = msg?.type;

        if (dev) {
          console.log(
            "[ASR-WS] DashScope event:",
            type,
            JSON.stringify(msg).slice(0, 300)
          );
        }

        if (type === "session.created") {
          dashWs.send(
            JSON.stringify({
              event_id: evtId(),
              type: "session.update",
              session: {
                input_audio_transcription: {
                  model: process.env.MODEL_ASR || "qwen3-asr-flash-realtime",
                  language: "zh",
                },
              },
            })
          );
        } else if (type === "session.updated") {
          ready = true;
          utteranceLive = true;
          resetTimer();
          sendToClient("started", { sessionId: randomUUID() });
          flushPending();
        } else if (
          type === "conversation.item.input_audio_transcription.completed"
        ) {
          const text = msg?.transcript ?? "";
          if (dev) console.log("[ASR-WS] final text:", text);
          if (text) {
            lastCompletedText = text;
            sendToClient("text", { text });
          }
        } else if (
          type === "conversation.item.input_audio_transcription.text"
        ) {
          const text = msg?.stash ?? msg?.text ?? msg?.transcript ?? "";
          if (text) sendToClient("partial", { text });
        } else if (type === "session.finished") {
          finalizeSession();
          return;
        } else if (type === "error") {
          console.error("[ASR-WS] DashScope error event:", msg?.error?.message);
          sendToClient("error", {
            error: msg?.error?.message ?? "语音识别失败",
          });
          utteranceLive = false;
          resetDashSession();
        }
      } catch {
        /* ignore parse errors */
      }
    });
  };

  const handleClientMessage = (msg) => {
    if (msg.type === "start") {
      if (dashWs) {
        utteranceLive = false;
        resetDashSession();
      }
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
      dashWs.send(
        JSON.stringify({
          event_id: evtId(),
          type: "input_audio_buffer.append",
          audio: msg.audio,
        })
      );
    } else if (msg.type === "push_binary") {
      // Binary audio path: msg.pcmBuffer is an ArrayBuffer/Buffer
      if (!dashWs || dashWs.readyState !== WebSocket.OPEN) return;
      resetTimer();
      // Convert binary PCM to base64 for DashScope
      const base64 = Buffer.from(msg.pcmBuffer).toString("base64");
      dashWs.send(
        JSON.stringify({
          event_id: evtId(),
          type: "input_audio_buffer.append",
          audio: base64,
        })
      );
    } else if (msg.type === "stop") {
      if (dashWs && dashWs.readyState === WebSocket.OPEN) {
        dashWs.send(
          JSON.stringify({ event_id: evtId(), type: "session.finish" })
        );
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
        dashWs.send(
          JSON.stringify({ event_id: evtId(), type: "session.finish" })
        );
      } catch {
        /* ignore */
      }
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
  const ttsWss = new WebSocketServer({ noServer: true });

  // Next.js upgrade handler for HMR WebSocket in dev mode
  const nextUpgradeHandler = app.getUpgradeHandler();

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url, true);
    if (pathname === "/api/asr-ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else if (pathname === "/api/tts-ws") {
      ttsWss.handleUpgrade(req, socket, head, (ws) => {
        ttsWss.emit("connection", ws, req);
      });
    } else if (nextUpgradeHandler) {
      nextUpgradeHandler(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (ws) => {
    handleAsrWebSocket(ws);
  });

  ttsWss.on("connection", (ws) => {
    handleTtsWebSocket(ws);
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
