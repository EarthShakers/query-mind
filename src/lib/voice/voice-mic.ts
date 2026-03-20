import { getCompatUserMedia } from "@/lib/voice/browser-audio";

/** 优先「干净」约束，失败则逐步放宽，兼容各类浏览器 / WebView */
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
