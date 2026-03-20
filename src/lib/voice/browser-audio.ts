/**
 * 浏览器侧：麦克风采集、AudioContext 单例、RecordRTC 动态加载。
 */

/**
 * 兼容各环境获取麦克风流：优先标准 `mediaDevices`，否则 webkit/moz 前缀 API。
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

/** 全页共用的 AudioContext，关闭后由 `resetSharedAudioContextSingleton` 清空引用 */
let sharedAudioContext: AudioContext | null = null;

/** 获取未关闭的单例 AudioContext，必要时新建 */
export function getOrCreateAudioContext(): AudioContext {
  if (sharedAudioContext && sharedAudioContext.state !== "closed") {
    return sharedAudioContext;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  sharedAudioContext = new Ctor();
  return sharedAudioContext;
}

/** 在已 `close()` AudioContext 后调用，允许下次重新创建单例 */
export function resetSharedAudioContextSingleton(): void {
  sharedAudioContext = null;
}

/** 动态 import 的 RecordRTC 默认导出，避免首屏打包过大 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedRecordRTC: any = null;

/** 懒加载并缓存 recordrtc 包 */
export async function getRecordRTC() {
  if (cachedRecordRTC) return cachedRecordRTC;
  cachedRecordRTC = (await import("recordrtc")).default;
  return cachedRecordRTC;
}
