import type { AsrTransport, AsrTransportHandlers } from "@/lib/voice/asr-transport";

/*
 * WebSocket 不可用时的 ASR 降级：REST 建会话 + EventSource 收事件 + fetch 推 base64 音频块。
 */

/** 将 ArrayBuffer 转为 JSON 可承载的 base64（分块避免 apply 参数长度限制） */
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
 * `/api/asr` 建 session → EventSource 收 partial/text/done → `pushAudio` 走 POST 分片。
 */
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
