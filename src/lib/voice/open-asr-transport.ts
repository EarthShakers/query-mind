import type { AsrWsChannel } from "@/lib/voice/asr-ws-channel";
import type { AsrTransport, AsrTransportHandlers } from "@/lib/voice/asr-transport";
import {
  createEphemeralWsTransport,
  createHttpTransport,
} from "@/lib/voice/asr-transport";

/**
 * 共享 channel 优先；否则临时 WS；失败再 WS 一次，最后 HTTP。
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
