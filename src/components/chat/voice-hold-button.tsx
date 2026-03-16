"use client";

import { useRef, useCallback, useState, useEffect } from "react";

const CANCEL_THRESHOLD_PX = 50;

interface VoiceHoldButtonProps {
  isRecording: boolean;
  isTranscribing: boolean;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
  onCancellingChange?: (cancelling: boolean) => void;
  className?: string;
  children: (props: { isRecording: boolean; isTranscribing: boolean }) => React.ReactNode;
}

/**
 * 长按录音、松手发送、上移取消（与 App 一致）
 * 参考 voicetoto.md：Pointer Events、touch-action、contextmenu 处理
 */
export function VoiceHoldButton({
  isRecording,
  isTranscribing,
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

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const preventSelect = (e: Event) => e.preventDefault();
    el.addEventListener("selectstart", preventSelect);
    return () => el.removeEventListener("selectstart", preventSelect);
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
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      startYRef.current = e.clientY;
      setIsCancelling(false);
      if (navigator.vibrate) navigator.vibrate(50);
      onStart();
    },
    [isTranscribing, onStart, setIsCancelling]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isRecording) return;
      const deltaY = startYRef.current - e.clientY;
      const cancelling = deltaY > CANCEL_THRESHOLD_PX;
      setIsCancelling(cancelling);
    },
    [isRecording, setIsCancelling]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (!isRecording) return;
      if (isCancellingRef.current) {
        onCancel();
      } else {
        onStop();
      }
      setIsCancelling(false);
    },
    [isRecording, onStop, onCancel, setIsCancelling]
  );

  const handlePointerCancel = useCallback(() => {
    if (isRecording) onCancel();
    setIsCancelling(false);
  }, [isRecording, onCancel, setIsCancelling]);

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
      {children({ isRecording, isTranscribing })}
    </div>
  );
}
