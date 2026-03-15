import WebSocket from "ws";
import { randomUUID } from "crypto";

const DASHSCOPE_WS_URL =
  "wss://dashscope.aliyuncs.com/api-ws/v1/inference/";

const FRAME_SIZE = 3200; // 100ms @ 16kHz 16bit mono
const TIMEOUT_MS = 30_000;

export async function transcribeWithDashScope(
  pcmData: Buffer,
  model: string
): Promise<string> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("语音识别服务未配置");

  return new Promise<string>((resolve, reject) => {
    const taskId = randomUUID().replace(/-/g, "");
    const sentences: string[] = [];
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        ws.close();
        reject(new Error("语音识别超时"));
      }
    }, TIMEOUT_MS);

    const ws = new WebSocket(DASHSCOPE_WS_URL, {
      headers: { Authorization: `bearer ${apiKey}` },
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
        const action = msg?.header?.action;

        if (action === "task-started") {
          // 开始发送 PCM 帧
          sendPcmFrames(ws, pcmData, taskId);
        } else if (action === "result-generated") {
          const text =
            msg?.payload?.output?.sentence?.text ??
            msg?.payload?.output?.text ??
            "";
          if (text) sentences.push(text);
        } else if (action === "task-finished") {
          finished = true;
          clearTimeout(timer);
          ws.close();
          resolve(sentences.join(""));
        } else if (action === "task-failed") {
          finished = true;
          clearTimeout(timer);
          ws.close();
          const errMsg =
            msg?.header?.error_message ?? "语音识别失败";
          reject(new Error(errMsg));
        }
      } catch {
        // ignore parse errors
      }
    });

    ws.on("open", () => {
      // 发送 run-task 指令
      ws.send(
        JSON.stringify({
          header: {
            action: "run-task",
            task_id: taskId,
            streaming: "duplex",
          },
          payload: {
            model,
            task_group: "audio",
            task: "asr",
            function: "recognition",
            parameters: {
              format: "pcm",
              sample_rate: 16000,
              language_hints: ["zh", "en"],
            },
            input: {},
          },
        })
      );
    });
  });
}

function sendPcmFrames(ws: WebSocket, pcmData: Buffer, taskId: string) {
  let offset = 0;
  const send = () => {
    while (offset < pcmData.length) {
      if (ws.readyState !== WebSocket.OPEN) return;
      const end = Math.min(offset + FRAME_SIZE, pcmData.length);
      const frame = pcmData.subarray(offset, end);
      ws.send(frame);
      offset = end;
    }
    // 所有帧发送完毕，发送 finish-task
    ws.send(
      JSON.stringify({
        header: {
          action: "finish-task",
          task_id: taskId,
          streaming: "duplex",
        },
        payload: { input: {} },
      })
    );
  };
  send();
}
