import type { AsrWsChannel } from "@/lib/voice/asr-ws-channel";
import { createHttpTransport } from "@/lib/voice/asr-http-transport";
import type { AsrTransport, AsrTransportHandlers } from "@/lib/voice/asr-transport";
import { createEphemeralWsTransport } from "@/lib/voice/asr-transport";

/*
 * 按环境选择 ASR 连接方式并带自动降级，供 `useVoiceInput` 单一入口调用。
 */

/**
 * 打开一轮 ASR 传输层（与 UI 解耦）：
 * - 若在聊天页注入了 `AsrWsChannel`，则在其长连接上 `beginUtterance`；
 * - 否则新建短生命周期 WebSocket；
 * - 首次 WS 失败会再试一次 WS，仍失败则降级 HTTP（SSE + fetch 推音频）。
 */
export function openAsrTransportWithFallback(
  asrChannel: AsrWsChannel | null,
  handlers: AsrTransportHandlers
): Promise<AsrTransport> {
  const open = asrChannel
    ? () => asrChannel.beginUtterance(handlers)
    : () => createEphemeralWsTransport(handlers);

  return open().catch((wsErr: Error) => {
    if (process.env.NODE_ENV === "development") {
      console.warn("[Voice] WebSocket failed, retrying...", wsErr.message);
    }
    return createEphemeralWsTransport(handlers).catch((retryErr: Error) => {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[Voice] WebSocket retry failed, falling back to HTTP:",
          retryErr.message
        );
      }
      return createHttpTransport(handlers);
    });
  });
}
