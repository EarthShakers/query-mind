import { buildAsrWsUrl } from "./build-ws-url";

/*
 * 浏览器 → 自建 ASR 网关的 WebSocket 传输：二进制推 PCM、长连接上轮换 utterance。
 * HTTP 降级见 asr-http-transport.ts（createHttpTransport）。
 */

/** 一轮识别会话：上行 PCM、结束并取终稿、中途取消 */
export interface AsrTransport {
  pushAudio(pcmBuffer: ArrayBuffer): void;
  stop(): Promise<string>;
  close(): void;
}

/** 网关在识别过程中推送的文本事件（partial / 终稿 / 纠错 / 错误） */
export type AsrTransportHandlers = {
  onPartial?: (text: string) => void;
  onText?: (text: string) => void;
  onCorrected?: (text: string, sourceText?: string) => void;
  onError?: (msg: string) => void;
  onDone?: () => void;
};

/**
 * 在已打开的 WebSocket 上开始一轮识别：发送 `{type:"start"}`，收到 `started` 后 resolve transport。
 * 用于共享长连接；本句结束只 `cleanupListeners`，**不**关闭底层 socket。
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

/**
 * 为每一轮识别单独 `new WebSocket`（句末会 close），与 `AsrWsChannel` 长连接相对。
 */
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
