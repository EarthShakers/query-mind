export function isAbortLikeError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("aborted") || msg.includes("aborterror");
  }
  return false;
}

export function messageForRecordingStartFailure(err: unknown): string {
  if (err instanceof DOMException && err.name === "NotAllowedError") {
    return "无法访问麦克风，请检查浏览器权限";
  }
  if (err instanceof Error) return err.message;
  return "录音启动失败";
}
