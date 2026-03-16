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
  /** 录音时实时音量 0-1，用于波形展示 */
  audioLevel?: number;
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
  audioLevel = 0,
  onStop,
  onCancel,
  holdToSend = true,
}: VoiceRecordingOverlayProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript, partialText]);

  const hasText = transcript || partialText;

  const overlay = (
    <div
      className="fixed inset-0 flex flex-col px-4 z-[9999]"
      style={{
        pointerEvents: isRecording ? "none" : "auto",
        background: "rgba(15, 23, 42, 0.4)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      {/* 顶部：识别文字 */}
      <div className="pt-12 pb-4 flex-1 min-h-0 flex flex-col items-center">
        <div
          ref={scrollRef}
          className="w-full max-w-lg flex-1 min-h-[80px] max-h-[35vh] overflow-y-auto rounded-2xl bg-white/95 shadow-xl border border-slate-200/50 px-4 py-3 text-slate-700 text-base leading-relaxed"
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
      </div>

      {/* 底部：渐变蓝 + 声波 + 松手提示 */}
      <div
        className="shrink-0 pb-8 pt-4"
        style={{
          paddingBottom: "max(env(safe-area-inset-bottom, 0px), 2rem)",
        }}
      >
        {isRecording && (
          <div
            className="rounded-2xl px-6 py-5 mb-4 overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #06b6d4 50%, #0ea5e9 100%)",
            }}
          >
            {/* 声波条：波形 + 音量驱动高度 */}
            <div className="flex items-center justify-center gap-1.5 h-14">
              {Array.from({ length: 28 }).map((_, i) => {
                const wave = Math.sin((i / 28) * Math.PI * 2) * 0.5 + 0.5;
                const level = (0.25 + 0.75 * wave) * (0.5 + 0.5 * audioLevel);
                return (
                  <div
                    key={i}
                    className="w-1.5 rounded-full bg-white/90 transition-all duration-75"
                    style={{ height: `${Math.max(6, level * 56)}px` }}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* 状态提示：松手发送 / 松开取消 / 转写中（柔和色） */}
        <div className="flex justify-center">
          {isRecording ? (
            isCancelling ? (
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 text-amber-800 text-sm">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 15l-6-6-6 6" />
                </svg>
                <span>松开取消</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-600 text-sm">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-slate-400 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-slate-500" />
                </span>
                <span>松手发送</span>
              </div>
            )
          ) : isTranscribing ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/90 text-slate-600 text-sm">
              <svg
                className="h-4 w-4 animate-spin text-indigo-500"
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

        {/* 操作按钮：转写时可取消 */}
        <div
          className="flex gap-3 mt-4 justify-center"
          style={{ pointerEvents: isTranscribing ? "auto" : "none" }}
        >
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
              className="px-6 py-2.5 rounded-xl text-sm font-medium bg-slate-200 text-slate-600 hover:bg-slate-300"
            >
              {isTranscribing ? "取消转写" : "停止"}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(overlay, document.body)
    : null;
}
