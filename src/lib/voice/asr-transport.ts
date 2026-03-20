import { buildAsrWsUrl } from "./build-ws-url";

export interface AsrTransport {
  pushAudio(pcmBuffer: ArrayBuffer): void;
  stop(): Promise<string>;
  close(): void;
}

export type AsrTransportHandlers = {
  onPartial?: (text: string) => void;
  onText?: (text: string) => void;
  onCorrected?: (text: string, sourceText?: string) => void;
  onError?: (msg: string) => void;
  onDone?: () => void;
};

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 1024;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize))
    );
  }
  return btoa(binary);
}

/**
 * 在已打开的 WebSocket 上开始一轮识别（发送 start，直到 started 再返回 transport）。
 * 用于共享长连接；结束时 remove 本轮 message 监听，不关闭 socket。
 */
export function beginUtteranceOnOpenSocket(
  ws: WebSocket,
  opts: AsrTransportHandlers
): Promise<AsrTransport> {
  return new Promise((resolve, reject) => {
    let finalText = "";
    let stopResolve: ((text: string) => void) | null = null;
    let done = false;
    let transportResolved = false;
    let utteranceCleaned = false;

    const cleanupListeners = () => {
      if (utteranceCleaned) return;
      utteranceCleaned = true;
      ws.removeEventListener("message", handleMessage);
      ws.removeEventListener("close", onClose);
    };

    const handleMessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data as string);
        if (msg.type === "started") {
          if (transportResolved) return;
          transportResolved = true;
          resolve({
            pushAudio(pcmBuffer: ArrayBuffer) {
              if (ws.readyState !== WebSocket.OPEN) return;
              ws.send(pcmBuffer);
            },
            stop() {
              return new Promise<string>((res) => {
                stopResolve = res;
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "stop" }));
                }
                setTimeout(() => {
                  if (stopResolve) {
                    stopResolve(finalText);
                    stopResolve = null;
                  }
                }, 15_000);
              });
            },
            close() {
              try {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "stop" }));
                }
              } catch {
                /* ignore */
              }
              cleanupListeners();
            },
          });
          return;
        }
        if (!transportResolved) return;

        if (msg.type === "partial") {
          if (msg.text) opts.onPartial?.(msg.text);
        } else if (msg.type === "text") {
          if (msg.text) {
            finalText = msg.text;
            opts.onText?.(msg.text);
          }
        } else if (msg.type === "text_corrected") {
          if (msg.text) {
            finalText = msg.text;
            opts.onCorrected?.(msg.text, msg.sourceText);
          }
        } else if (msg.type === "done") {
          done = true;
          cleanupListeners();
          opts.onDone?.();
          if (stopResolve) {
            stopResolve(finalText);
            stopResolve = null;
          }
        } else if (msg.type === "error") {
          opts.onError?.(msg.error || "语音识别失败");
          if (stopResolve) {
            stopResolve(finalText);
            stopResolve = null;
          }
          cleanupListeners();
        }
      } catch {
        /* ignore */
      }
    };

    ws.addEventListener("message", handleMessage);

    const onClose = () => {
      if (!done && transportResolved) {
        opts.onDone?.();
        if (stopResolve) {
          stopResolve(finalText);
          stopResolve = null;
        }
      }
      cleanupListeners();
    };
    ws.addEventListener("close", onClose);

    if (ws.readyState !== WebSocket.OPEN) {
      cleanupListeners();
      reject(new Error("WebSocket 未连接"));
      return;
    }

    try {
      ws.send(JSON.stringify({ type: "start" }));
    } catch {
      cleanupListeners();
      reject(new Error("无法发送 start"));
    }
  });
}

/** 每次新建 WebSocket 的一轮识别（兼容旧行为） */
export function createEphemeralWsTransport(
  opts: AsrTransportHandlers
): Promise<AsrTransport> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(buildAsrWsUrl());
    let settled = false;

    ws.onopen = () => {
      beginUtteranceOnOpenSocket(ws, opts).then(
        (t) => {
          settled = true;
          const innerStop = t.stop.bind(t);
          const innerClose = t.close.bind(t);
          resolve({
            pushAudio: (b) => t.pushAudio(b),
            stop: () => innerStop(),
            close() {
              innerClose();
              if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
              }
            },
          });
        },
        reject
      );
    };

    ws.onerror = () => {
      if (!settled) reject(new Error("WebSocket 连接失败"));
    };

    setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.close();
        if (!settled) reject(new Error("WebSocket 连接超时"));
      }
    }, 10_000);
  });
}

export function createHttpTransport(
  opts: AsrTransportHandlers
): Promise<AsrTransport> {
  return (async () => {
    const res = await fetch("/api/asr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "无法启动语音识别");
    const sessionId = data.sessionId as string;

    const es = new EventSource(`/api/asr?sessionId=${sessionId}`);
    let finalText = "";

    es.addEventListener("partial", (e) => {
      const { text } = JSON.parse((e as MessageEvent).data);
      if (text) opts.onPartial?.(text);
    });
    es.addEventListener("text", (e) => {
      const { text } = JSON.parse((e as MessageEvent).data);
      if (text) {
        finalText = text;
        opts.onText?.(text);
      }
    });
    es.addEventListener("error", (e) => {
      try {
        const evt = e as MessageEvent;
        if (evt.data) {
          const { error: msg } = JSON.parse(evt.data);
          if (msg) opts.onError?.(msg);
        }
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("done", () => {
      opts.onDone?.();
      es.close();
    });

    let flushFailCount = 0;
    let sessionDead = false;

    return {
      pushAudio(pcmBuffer: ArrayBuffer) {
        if (sessionDead) return;
        const base64 = bufferToBase64(pcmBuffer);
        fetch("/api/asr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "push", sessionId, audio: base64 }),
        })
          .then(async (res) => {
            const d = await res.json().catch(() => ({}));
            if (d?.dropped) {
              sessionDead = true;
              opts.onError?.("会话已断开，请重新开始");
              opts.onDone?.();
            } else {
              flushFailCount = 0;
            }
          })
          .catch(() => {
            flushFailCount += 1;
            if (flushFailCount >= 5) {
              sessionDead = true;
              opts.onError?.("网络异常，请检查连接");
              opts.onDone?.();
              flushFailCount = 0;
            }
          });
      },
      async stop() {
        try {
          const stopRes = await fetch("/api/asr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "stop", sessionId }),
          });
          const stopData = await stopRes.json();
          const transcript = (stopData?.transcript ?? "") as string;
          if (transcript.trim()) finalText = transcript;
        } catch {
          /* ignore */
        }
        es.close();
        return finalText;
      },
      close() {
        es.close();
        fetch("/api/asr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "stop", sessionId }),
        }).catch(() => {});
      },
    } satisfies AsrTransport;
  })();
}
