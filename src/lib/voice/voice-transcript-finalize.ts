import { isAbortLikeError } from "@/lib/voice/voice-errors";

/*
 * 松手结束录音后：根据 transport.stop() 的终稿、partial、网关 HTML 错误页等分支处理 UI 回调。
 */

type Ref<T> = { current: T };

/** 识别服务若错返回 HTML 错误页，避免当作文本插入输入框 */
function looksLikeHtmlResponse(text: string): boolean {
  const t = text.trim();
  return t.startsWith("<!") || t.toLowerCase().startsWith("<html");
}

/**
 * stop() 拿到最终 transcript 后的分支：正文 / HTML 异常 / 等 partial / catch 兜底
 */
export async function finalizeVoiceTranscript(params: {
  transcript: string;
  hasResultRef: Ref<boolean>;
  savedPartial: string;
  hadPartial: boolean;
  onResult: (text: string) => void;
  onError?: (message: string) => void;
}): Promise<void> {
  const {
    transcript,
    hasResultRef,
    savedPartial,
    hadPartial,
    onResult,
    onError,
  } = params;
  const isHtml =
    typeof transcript === "string" && looksLikeHtmlResponse(transcript);
  if (transcript.trim() && !isHtml) {
    hasResultRef.current = true;
    onResult(transcript);
    return;
  }
  if (isHtml) {
    onError?.("语音识别服务异常，请稍后重试");
    return;
  }
  if (!hasResultRef.current) {
    await new Promise((r) => setTimeout(r, 800));
    if (!hasResultRef.current) {
      if (savedPartial) {
        hasResultRef.current = true;
        onResult(savedPartial);
      } else if (hadPartial) {
        onError?.("识别不完整，请重试");
      } else {
        onError?.("未识别到语音，请靠近麦克风重试");
      }
    }
  }
}

/**
 * `stop()` Promise 被拒绝时的兜底：非 abort 且尚无终稿时，用 partial 或通用错误提示。
 */
export function handleFinalizeVoiceError(params: {
  err: unknown;
  hasResultRef: Ref<boolean>;
  savedPartial: string;
  onResult: (text: string) => void;
  onError?: (message: string) => void;
}): void {
  const { err, hasResultRef, savedPartial, onResult, onError } = params;
  if (!hasResultRef.current && !isAbortLikeError(err)) {
    if (savedPartial) {
      hasResultRef.current = true;
      onResult(savedPartial);
    } else {
      onError?.("转写失败，请重试");
    }
  }
}
