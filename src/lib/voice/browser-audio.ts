/**
 * 兼容 getUserMedia：优先 navigator.mediaDevices.getUserMedia，
 * 回退到旧版（微信 WebView 等）。
 */
export function getCompatUserMedia(
  constraints: MediaStreamConstraints
): Promise<MediaStream> {
  if (navigator.mediaDevices?.getUserMedia) {
    return navigator.mediaDevices.getUserMedia(constraints);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legacyGetUserMedia =
    (navigator as any).getUserMedia ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).webkitGetUserMedia ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).mozGetUserMedia;
  if (legacyGetUserMedia) {
    return new Promise((resolve, reject) => {
      legacyGetUserMedia.call(navigator, constraints, resolve, reject);
    });
  }
  const isHTTP =
    typeof location !== "undefined" && location.protocol === "http:";
  const hint = isHTTP
    ? "录音功能需要 HTTPS，请使用 HTTPS 访问本站"
    : "当前浏览器不支持录音功能";
  return Promise.reject(new Error(hint));
}

/** AudioContext 单例，避免移动端频繁创建耗尽系统额度 */
let sharedAudioContext: AudioContext | null = null;

export function getOrCreateAudioContext(): AudioContext {
  if (sharedAudioContext && sharedAudioContext.state !== "closed") {
    return sharedAudioContext;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  sharedAudioContext = new Ctor();
  return sharedAudioContext;
}

export function resetSharedAudioContextSingleton(): void {
  sharedAudioContext = null;
}

/** 缓存 RecordRTC 模块 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedRecordRTC: any = null;
export async function getRecordRTC() {
  if (cachedRecordRTC) return cachedRecordRTC;
  cachedRecordRTC = (await import("recordrtc")).default;
  return cachedRecordRTC;
}
