"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface VoiceRecordingOverlayProps {
  isRecording: boolean;
  isTranscribing: boolean;
  /** 上移取消状态（松手将取消） */
  isCancelling?: boolean;
  transcript: string;
  partialText: string;
  onStop: () => void;
  onCancel?: () => void;
  /** 是否使用长按交互（松手发送），为 true 时录音中不显示停止按钮 */
  holdToSend?: boolean;
}

/**
 * 语音录制浮层：录音/转写时全屏展示，避免识别文字撑乱输入栏布局
 * 参考 voicetoto.md：背景微暗、独立展示区、移动端友好
 */
export function VoiceRecordingOverlay({
  isRecording,
  isTranscribing,
  isCancelling = false,
  transcript,
  partialText,
  onStop,
  onCancel,
  holdToSend = true,
}: VoiceRecordingOverlayProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新文字时自动滚动到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript, partialText]);

  const hasText = transcript || partialText;

  const overlay = (
    <div
      className="fixed inset-0 flex flex-col items-center justify-end px-4 z-[9999]"
      style={{
        background: "rgba(15, 23, 42, 0.4)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 6rem)",
      }}
    >
      {/* 状态提示：上移取消 / 正在录音 / 转写中 */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-sm font-medium">
        {isRecording ? (
          isCancelling ? (
            <div className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-full">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 15l-6-6-6 6" />
              </svg>
              <span>松开取消</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-full">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
              </span>
              <span>正在录音 · 松手发送</span>
            </div>
          )
        ) : isTranscribing ? (
          <div className="flex items-center gap-2 bg-white/90 text-slate-700 px-4 py-2 rounded-full">
            <svg
              className="h-4 w-4 animate-spin text-amber-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83" />
            </svg>
            <span>转写中...</span>
          </div>
        ) : null}
      </div>

      {/* 识别文字区域：固定高度、内部滚动，不撑乱布局 */}
      <div
        ref={scrollRef}
        className="w-full max-w-lg max-h-[40vh] min-h-[80px] overflow-y-auto rounded-2xl bg-white/95 shadow-xl border border-slate-200/50 px-4 py-3 text-slate-700 text-base leading-relaxed"
      >
        {hasText ? (
          <>
            <span>{transcript}</span>
            {partialText && (
              <span className="text-slate-400">{partialText}</span>
            )}
          </>
        ) : (
          <p className="text-slate-400 text-sm">
            {isRecording ? "请说话..." : "处理中..."}
          </p>
        )}
      </div>

      {/* 操作按钮：长按模式下录音中不显示（松手即操作）；转写中可取消 */}
      <div className="flex gap-3 mt-4">
        {!holdToSend && isRecording && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl border border-slate-300 bg-white/90 text-slate-600 text-sm font-medium hover:bg-slate-50"
          >
            取消
          </button>
        )}
        {(!holdToSend || isTranscribing) && (
          <button
            type="button"
            onClick={isTranscribing ? onCancel : onStop}
            disabled={isTranscribing && !onCancel}
            className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              isTranscribing
                ? "bg-slate-200 text-slate-600 hover:bg-slate-300"
                : "bg-red-500 text-white hover:bg-red-600"
            }`}
          >
            {isTranscribing ? "取消转写" : "停止"}
          </button>
        )}
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(overlay, document.body)
    : null;
}
