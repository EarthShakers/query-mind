"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
 * 语音录制浮层：录音/转写时全屏展示，毛玻璃沉浸 + 音量驱动涟漪
 * 参考 Gemini 设计：AnimatePresence 平滑进出、level 驱动光晕、状态过渡
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 flex flex-col px-4 z-[9999]"
        style={{
          // 根节点不拦截点击，避免退出动画期间阻挡第二次长按
          pointerEvents: "none",
          background: "rgba(15, 23, 42, 0.4)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
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
            <div className="relative flex justify-center mb-4">
              {/* 音量驱动涟漪：类似呼吸的物理反馈 */}
              <AnimatePresence>
                {!isCancelling && (
                  <>
                    <motion.div
                      initial={{ scale: 1, opacity: 0 }}
                      animate={{
                        scale: 1 + audioLevel * 1.2,
                        opacity: 0.25,
                      }}
                      exit={{ opacity: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-20 rounded-full bg-blue-500/50 blur-2xl"
                    />
                    <motion.div
                      initial={{ scale: 1, opacity: 0 }}
                      animate={{
                        scale: 1 + audioLevel * 0.6,
                        opacity: 0.4,
                      }}
                      exit={{ opacity: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-20 rounded-full bg-cyan-400/30 blur-md"
                    />
                  </>
                )}
              </AnimatePresence>

              <div
                className="relative rounded-2xl px-6 py-5 overflow-hidden"
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
                      <motion.div
                        key={i}
                        layout
                        className="w-1.5 rounded-full bg-white/90"
                        style={{ height: `${Math.max(6, level * 56)}px` }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 状态提示：松手发送 / 松开取消 / 转写中（平滑过渡） */}
          <div className="flex justify-center">
            {isRecording ? (
              <motion.div
                key={isCancelling ? "cancel" : "send"}
                initial={{ y: 4, opacity: 0.8 }}
                animate={{
                  y: isCancelling ? -8 : 0,
                  opacity: 1,
                }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm ${
                  isCancelling ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
                }`}
              >
                {isCancelling ? (
                  <>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 15l-6-6-6 6" />
                    </svg>
                    <span>松开取消</span>
                  </>
                ) : (
                  <>
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-slate-400 opacity-60" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-slate-500" />
                    </span>
                    <span>松手发送</span>
                  </>
                )}
              </motion.div>
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
    </motion.div>
  );

  return typeof document !== "undefined"
    ? createPortal(overlay, document.body)
    : null;
}
