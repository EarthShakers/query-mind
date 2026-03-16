"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const CANCEL_THRESHOLD_PX = 50;

/** 按钮 UI：果冻挤压 + 音量驱动涟漪，供 chat 页使用 */
export function VoiceHoldButtonUI({
  isRecording,
  isTranscribing,
  isCancelling,
  audioLevel,
}: {
  isRecording: boolean;
  isTranscribing: boolean;
  isCancelling: boolean;
  audioLevel: number;
}) {
  return (
    <div className="relative">
      {/* 录音时音量驱动涟漪 */}
      <AnimatePresence>
        {isRecording && !isCancelling && (
          <>
            <motion.div
              initial={{ scale: 1, opacity: 0 }}
              animate={{
                scale: 1 + audioLevel * 0.8,
                opacity: 0.2,
              }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="absolute inset-0 rounded-xl bg-blue-500/50 blur-lg pointer-events-none"
            />
            <motion.div
              initial={{ scale: 1, opacity: 0 }}
              animate={{
                scale: 1 + audioLevel * 0.4,
                opacity: 0.3,
              }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="absolute inset-0 rounded-xl bg-cyan-400/30 blur-md pointer-events-none"
            />
          </>
        )}
      </AnimatePresence>

      {/* 果冻挤压：whileTap 模拟按压形变 */}
      <motion.div
        whileTap={{ scale: 0.96, borderRadius: 16 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={`relative rounded-xl border px-3 md:px-4 py-3 text-sm font-medium text-center transition-colors ${
          isTranscribing
            ? "bg-amber-50 border-amber-200 text-amber-600"
            : isRecording
              ? isCancelling
                ? "bg-red-100 border-red-400 text-red-700"
                : "bg-red-50 border-red-300 text-red-600"
              : "bg-white border-slate-200 text-slate-400"
        }`}
      >
        {isTranscribing ? (
          <span className="inline-flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83" />
            </svg>
            转写中...
          </span>
        ) : isRecording ? (
          <span className="inline-flex items-center gap-2">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
            </span>
            {isCancelling ? "松开取消" : "松手发送"}
          </span>
        ) : (
          "长按 说话"
        )}
      </motion.div>
    </div>
  );
}

interface VoiceHoldButtonProps {
  isRecording: boolean;
  isTranscribing: boolean;
  /** 录音时实时音量 0-1，用于涟漪动效 */
  audioLevel?: number;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
  onCancellingChange?: (cancelling: boolean) => void;
  className?: string;
  children: (props: {
    isRecording: boolean;
    isTranscribing: boolean;
    isCancelling: boolean;
    audioLevel: number;
  }) => React.ReactNode;
}

/**
 * 长按录音、松手发送、上移取消（与 App 一致）
 * 参考 voicetoto.md：Pointer Events、touch-action、contextmenu 处理
 */
export function VoiceHoldButton({
  isRecording,
  isTranscribing,
  audioLevel = 0,
  onStart,
  onStop,
  onCancel,
  onCancellingChange,
  className = "",
  children,
}: VoiceHoldButtonProps) {
  const startYRef = useRef(0);
  const isCancellingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isCancelling, setIsCancellingState] = useState(false);

  // Track press state locally via ref — immune to the stale-closure problem
  // that plagues the `isRecording` prop (which is only set to true after the
  // async startRecording finishes, long after pointerup may have fired).
  const isActiveRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const preventSelect = (e: Event) => e.preventDefault();
    // touchstart preventDefault is the only reliable way to stop mobile
    // browsers from hijacking the long-press for text selection / callout,
    // which would fire pointercancel and kill the recording.
    // Must use addEventListener (not React onTouchStart) so we can set
    // { passive: false } — React registers touch listeners as passive.
    const preventTouch = (e: TouchEvent) => e.preventDefault();
    el.addEventListener("selectstart", preventSelect);
    el.addEventListener("touchstart", preventTouch, { passive: false });
    return () => {
      el.removeEventListener("selectstart", preventSelect);
      el.removeEventListener("touchstart", preventTouch);
    };
  }, []);

  const setIsCancelling = useCallback(
    (v: boolean) => {
      isCancellingRef.current = v;
      setIsCancellingState(v);
      onCancellingChange?.(v);
    },
    [onCancellingChange]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (isTranscribing) return;
      containerRef.current?.setPointerCapture?.(e.pointerId);
      startYRef.current = e.clientY;
      setIsCancelling(false);
      isActiveRef.current = true;
      if (navigator.vibrate) navigator.vibrate(50);
      onStart();
    },
    [isTranscribing, onStart, setIsCancelling]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isActiveRef.current) return;
      const deltaY = startYRef.current - e.clientY;
      const cancelling = deltaY > CANCEL_THRESHOLD_PX;
      setIsCancelling(cancelling);
    },
    [setIsCancelling]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      containerRef.current?.releasePointerCapture?.(e.pointerId);
      if (!isActiveRef.current) return;
      isActiveRef.current = false;
      if (isCancellingRef.current) {
        onCancel();
      } else {
        onStop();
      }
      setIsCancelling(false);
    },
    [onStop, onCancel, setIsCancelling]
  );

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    containerRef.current?.releasePointerCapture?.(e.pointerId);
    if (isActiveRef.current) {
      isActiveRef.current = false;
      onCancel();
    }
    setIsCancelling(false);
  }, [onCancel, setIsCancelling]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div
      ref={containerRef}
      role="button"
      tabIndex={0}
      data-voice-hold
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onContextMenu={handleContextMenu}
      style={{
        touchAction: "none",
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
      className={`select-none touch-manipulation [&_*]:select-none ${className}`}
    >
      {children({ isRecording, isTranscribing, isCancelling, audioLevel })}
    </div>
  );
}
