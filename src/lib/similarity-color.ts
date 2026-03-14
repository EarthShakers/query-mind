/** 匹配度颜色配置 */
export interface SimilarityColorConfig {
  text: string;
  bar: string;
  label: string;
}

/** 评分来源：embedding 向量相似度 / rerank 交叉编码器相关度 */
export type ScoreType = "embedding" | "rerank";

/** 根据匹配度（0–100）返回颜色类名 */
export function getSimilarityColor(pct: number): string {
  return getSimilarityConfig(pct, "light").text;
}

/** 返回完整颜色配置（含进度条、语义标签）
 * @param variant light=浅色背景(thinking-details) dark=深色背景(agent-progress)
 * @param scoreType embedding=向量相似度(阈值80/60/40) rerank=Rerank相关度(阈值70/50/30, sigmoid归一化, 0.5为相关性分界线)
 */
export function getSimilarityConfig(
  pct: number,
  variant: "light" | "dark" = "light",
  scoreType: ScoreType = "embedding"
): SimilarityColorConfig {
  const isDark = variant === "dark";
  const thresholds =
    scoreType === "rerank"
      ? { high: 70, mid: 50, midLow: 30 }
      : { high: 80, mid: 60, midLow: 40 };

  if (pct >= thresholds.high)
    return {
      text: isDark ? "text-emerald-400" : "text-emerald-600",
      bar: "bg-emerald-500",
      label: "高",
    };
  if (pct >= thresholds.mid)
    return {
      text: isDark ? "text-amber-400" : "text-amber-600",
      bar: "bg-amber-500",
      label: "中",
    };
  if (pct >= thresholds.midLow)
    return {
      text: isDark ? "text-orange-400" : "text-orange-600",
      bar: "bg-orange-500",
      label: "中低",
    };
  return {
    text: isDark ? "text-rose-400" : "text-rose-600",
    bar: "bg-rose-500",
    label: "低",
  };
}
