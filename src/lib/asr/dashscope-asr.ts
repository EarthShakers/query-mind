import WebSocket from "ws";
import { randomUUID } from "crypto";

const DASHSCOPE_BASE_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime";
const CHUNK_SIZE = 4800; // 300ms @ 16kHz 16bit mono = 9600 bytes, use ~150ms
const TIMEOUT_MS = 30_000;

export async function transcribeWithDashScope(
  pcmData: Buffer,
  model: string
): Promise<string> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("语音识别服务未配置");

  const wsUrl = `${DASHSCOPE_BASE_URL}?model=${encodeURIComponent(model)}`;

  return new Promise<string>((resolve, reject) => {
    const sentences: string[] = [];
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        ws.close();
        reject(new Error("语音识别超时"));
      }
    }, TIMEOUT_MS);

    const ws = new WebSocket(wsUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    ws.on("error", () => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        reject(new Error("语音识别服务连接失败"));
      }
    });

    ws.on("close", () => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve(sentences.join(""));
      }
    });

    ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        const type = msg?.type as string | undefined;

        if (type === "session.created") {
          // 发送 session.update 配置转写参数
          ws.send(
            JSON.stringify({
              event_id: `evt_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
              type: "session.update",
              session: {
                turn_detection: null, // Manual 模式
                input_audio_format: "pcm",
                input_audio_transcription: {
                  model,
                  language: "zh",
                  prompt: "",
                },
              },
            })
          );
        } else if (type === "session.updated") {
          // 配置完成，开始发送音频
          sendAudioChunks(ws, pcmData);
        } else if (
          type === "conversation.item.input_audio_transcription.completed"
        ) {
          const text = msg?.transcript ?? "";
          if (text) sentences.push(text);
        } else if (type === "session.finished") {
          finished = true;
          clearTimeout(timer);
          ws.close();
          resolve(sentences.join(""));
        } else if (type === "error") {
          finished = true;
          clearTimeout(timer);
          ws.close();
          reject(new Error(msg?.error?.message ?? "语音识别失败"));
        }
      } catch {
        // ignore parse errors
      }
    });
  });
}

function sendAudioChunks(ws: WebSocket, pcmData: Buffer) {
  let offset = 0;

  // 逐块发送 base64 编码的 PCM 音频
  while (offset < pcmData.length) {
    if (ws.readyState !== WebSocket.OPEN) return;
    const end = Math.min(offset + CHUNK_SIZE, pcmData.length);
    const chunk = pcmData.subarray(offset, end);
    ws.send(
      JSON.stringify({
        event_id: `evt_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
        type: "input_audio_buffer.append",
        audio: chunk.toString("base64"),
      })
    );
    offset = end;
  }

  // 发送 commit 表示音频结束（Manual 模式）
  ws.send(
    JSON.stringify({
      event_id: `evt_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      type: "input_audio_buffer.commit",
    })
  );

  // 发送 session.finish
  ws.send(
    JSON.stringify({
      event_id: `evt_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      type: "session.finish",
    })
  );
}
