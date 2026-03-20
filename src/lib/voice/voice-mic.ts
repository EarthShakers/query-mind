import { getCompatUserMedia } from "@/lib/voice/browser-audio";

/*
 * 麦克风约束降级策略，与 UI 无关。
 */

/**
 * 请求单声道麦克风流：优先关闭系统 AEC/NS/AGC 以减轻「被压扁」的波形，
 * 失败则打开浏览器默认处理，最后再退化为 `audio: true`。
 */
export async function requestMicStreamWithFallback(): Promise<MediaStream> {
  try {
    return await getCompatUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch {
    try {
      return await getCompatUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      return getCompatUserMedia({ audio: true });
    }
  }
}
