import { isAbortLikeError } from "@/lib/voice/voice-errors";

type Ref<T> = { current: T };

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
