"use client";

import { useEffect, useState } from "react";

interface ToastProps {
  message: string | null;
  onDismiss: () => void;
  duration?: number;
}

/** 简单 Toast：居中底部，自动消失 */
export function Toast({ message, onDismiss, duration = 3000 }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const t = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, duration);
    return () => clearTimeout(t);
  }, [message, duration, onDismiss]);

  if (!message || !visible) return null;

  return (
    <div
      className="fixed left-1/2 bottom-24 -translate-x-1/2 z-[10000] px-4 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-medium shadow-lg"
      role="alert"
    >
      {message}
    </div>
  );
}
