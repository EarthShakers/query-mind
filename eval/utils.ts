/**
 * 评估工具函数
 */
import { embed } from "../src/lib/embed";

/** 余弦相似度 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/** 批量 embed，串行调用避免限流 */
export async function batchEmbed(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const t of texts) {
    results.push(await embed(t));
  }
  return results;
}

/** 延迟 ms 毫秒 */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 将数值夹到 [0, 1] */
export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
