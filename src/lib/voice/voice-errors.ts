/**
 * 语音流程中与「用户取消 / 权限 / 异常」相关的错误判断与文案。
 */

/** 是否为类似 Abort 的中断（含 DOMException 与 message 启发式） */
export function isAbortLikeError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("aborted") || msg.includes("aborterror");
  }
  return false;
}

/** 将启动录音阶段的异常转换为用户可见中文说明 */
export function messageForRecordingStartFailure(err: unknown): string {
  if (err instanceof DOMException && err.name === "NotAllowedError") {
    return "无法访问麦克风，请检查浏览器权限";
  }
  if (err instanceof Error) return err.message;
  return "录音启动失败";
}
