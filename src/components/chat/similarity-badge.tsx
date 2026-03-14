"use client";

import { getSimilarityConfig } from "@/lib/similarity-color";

interface SimilarityBadgeProps {
  /** 匹配度 0–100 */
  pct: number;
  /** light=浅色背景 dark=深色背景 */
  variant?: "light" | "dark";
  /** 是否显示进度条 */
  showBar?: boolean;
  /** 是否显示语义标签（高/中/低） */
  showLabel?: boolean;
}

/** 匹配度展示：进度条 + 数字 + 可选语义标签 */
export function SimilarityBadge({
  pct,
  variant = "light",
  showBar = true,
  showLabel = true,
}: SimilarityBadgeProps) {
  const cfg = getSimilarityConfig(pct, variant);
  const barBg = variant === "dark" ? "bg-white/10" : "bg-slate-200";

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <div className="flex items-center gap-1.5">
        {showLabel && (
          <span
            className={`text-[10px] font-medium opacity-80 ${cfg.text}`}
            title={`匹配度 ${cfg.label}`}
          >
            {cfg.label}
          </span>
        )}
        <span className={`text-sm font-bold tabular-nums ${cfg.text}`}>
          {pct}%
        </span>
      </div>
      {showBar && (
        <div
          className={`w-14 h-1.5 rounded-full overflow-hidden ${barBg}`}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full rounded-full transition-all ${cfg.bar}`}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      )}
    </div>
  );
}
