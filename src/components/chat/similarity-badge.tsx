"use client";

import { getSimilarityConfig, type ScoreType } from "@/lib/similarity-color";

interface SimilarityBadgeProps {
  /** 匹配度 0–100 */
  pct: number;
  /** light=浅色背景 dark=深色背景 */
  variant?: "light" | "dark";
  /** 评分来源：embedding 向量相似度 / rerank 交叉编码器相关度 */
  scoreType?: ScoreType;
  /** 是否显示进度条 */
  showBar?: boolean;
  /** 是否显示语义标签（高/中/低） */
  showLabel?: boolean;
}

const SCORE_TITLE: Record<ScoreType, string> = {
  embedding: "匹配度",
  rerank: "相关度",
};

/** 各策略的正常分数上限，用于进度条缩放 */
const BAR_CEILING: Record<ScoreType, number> = {
  embedding: 100,
  rerank: 70,
};

/** 各策略的正常范围提示 */
const RANGE_HINT: Record<ScoreType, string> = {
  embedding: "正常范围 40–95%",
  rerank: "正常范围 10–70%",
};

/** 匹配度展示：进度条 + 数字 + 可选语义标签 */
export function SimilarityBadge({
  pct,
  variant = "light",
  scoreType = "embedding",
  showBar = true,
  showLabel = true,
}: SimilarityBadgeProps) {
  const cfg = getSimilarityConfig(pct, variant, scoreType);
  const barBg = variant === "dark" ? "bg-white/10" : "bg-slate-200";
  const isDark = variant === "dark";
  const title = SCORE_TITLE[scoreType];
  const ceiling = BAR_CEILING[scoreType];
  const barPct = Math.min(100, Math.max(0, (pct / ceiling) * 100));

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <div className="flex items-center gap-1.5">
        {showLabel && (
          <span className={`text-[10px] font-medium opacity-80 ${cfg.text}`}>
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
          aria-valuemax={ceiling}
        >
          <div
            className={`h-full rounded-full transition-all ${cfg.bar}`}
            style={{ width: `${barPct}%` }}
          />
        </div>
      )}
      {showBar && (
        <span className={`text-[9px] opacity-50 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          {title} {RANGE_HINT[scoreType]}
        </span>
      )}
    </div>
  );
}
