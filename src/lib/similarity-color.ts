/** 匹配度颜色配置 */
export interface SimilarityColorConfig {
  text: string;
  bar: string;
  label: string;
}

/** 根据匹配度（0–100）返回颜色类名 */
export function getSimilarityColor(pct: number): string {
  return getSimilarityConfig(pct, "light").text;
}

/** 返回完整颜色配置（含进度条、语义标签）
 * @param variant light=浅色背景(thinking-details) dark=深色背景(agent-progress)
 */
export function getSimilarityConfig(
  pct: number,
  variant: "light" | "dark" = "light"
): SimilarityColorConfig {
  const isDark = variant === "dark";
  if (pct >= 80)
    return {
      text: isDark ? "text-emerald-400" : "text-emerald-600",
      bar: "bg-emerald-500",
      label: "高",
    };
  if (pct >= 60)
    return {
      text: isDark ? "text-amber-400" : "text-amber-600",
      bar: "bg-amber-500",
      label: "中",
    };
  if (pct >= 40)
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
