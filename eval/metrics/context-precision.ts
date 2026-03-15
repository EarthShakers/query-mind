/**
 * Context Precision（上下文精确度）- RAGAS 方法
 *
 * Step 1: LLM 判断每个 context chunk 是否与问题相关
 * Step 2: 使用排序加权 precision@k 计算得分
 * Score = (1/total_relevant) * sum(precision_at_k * is_relevant_k)
 *
 * 奖励将相关文档排在前面的检索系统
 */
import { getDashScopeLLM } from "../../src/lib/llm/llm";
import { MODEL_LIGHT } from "../../src/lib/llm/models";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import type { EvalSample, MetricTrace } from "../types";

const RelevanceJudgmentSchema = z.object({
  judgments: z
    .array(
      z.object({
        index: z.number().describe("chunk 序号（从 1 开始）"),
        relevant: z.boolean().describe("该 chunk 是否与问题相关"),
      })
    )
    .describe("对每个 chunk 的相关性判断"),
});

/** Step 1: LLM 判断每个 context chunk 的相关性 */
async function judgeRelevance(
  question: string,
  contexts: string[]
): Promise<boolean[]> {
  const llm = getDashScopeLLM({ model: MODEL_LIGHT, maxTokens: 512 });
  const structured = llm.withStructuredOutput(RelevanceJudgmentSchema, { method: "jsonMode" });

  // 每个 chunk 保留完整内容（最多 3000 字符），避免截断导致误判
  const chunksStr = contexts
    .map((c, i) => `[Chunk ${i + 1}]\n${c.slice(0, 3000)}`)
    .join("\n\n");

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `你是一个检索质量评估员。对于给定的问题和一组检索到的文档片段，判断每个片段是否包含与问题相关的有用信息。
判断标准：只要片段中任何位置包含能帮助回答问题的信息（哪怕只是部分相关），就标记为 relevant: true。
仅当片段内容与问题完全无关时，才标记为 relevant: false。
请仔细阅读每个片段的完整内容后再做判断。
请以 JSON 格式返回，格式为：{{"judgments": [{{"index": 1, "relevant": true/false}}, ...]}}`,
    ],
    [
      "human",
      `问题：{question}

检索到的文档片段：
{chunks}`,
    ],
  ]);

  console.log(`\n[ContextPrecision] 问题: ${question}`);
  console.log(`[ContextPrecision] 共 ${contexts.length} 个 chunks:`);
  contexts.forEach((c, i) => {
    console.log(
      `  [Chunk ${i + 1}] (${c.length} chars) ${c
        .slice(0, 120)
        .replace(/\n/g, " ")}...`
    );
  });

  const result = await prompt.pipe(structured).invoke({
    question,
    chunks: chunksStr,
  });

  const judgments = (result as z.infer<typeof RelevanceJudgmentSchema>)
    ?.judgments;

  console.log(
    `[ContextPrecision] Judge 返回 ${judgments?.length ?? 0} 条判断:`
  );
  judgments?.forEach((j) => {
    console.log(`  [Chunk ${j.index}] relevant=${j.relevant}`);
  });

  if (!judgments || judgments.length === 0) {
    console.log(`[ContextPrecision] ⚠ Judge 返回为空，全部标记 false`);
    return contexts.map(() => false);
  }

  // 自动检测 judge 返回的是 0-indexed 还是 1-indexed
  const minIdx = Math.min(...judgments.map((j) => j.index));
  const maxIdx = Math.max(...judgments.map((j) => j.index));
  const isZeroIndexed = minIdx === 0 && maxIdx === contexts.length - 1;
  const offset = isZeroIndexed ? 0 : 1;

  if (isZeroIndexed) {
    console.log(`[ContextPrecision] ⚠ Judge 返回 0-indexed，自动修正`);
  }

  // 按 index 映射回布尔数组
  const relevanceMap = new Map(judgments.map((j) => [j.index, j.relevant]));
  return contexts.map((_, i) => relevanceMap.get(i + offset) ?? false);
}

/** Step 2: 计算加权 precision@k */
function weightedPrecisionAtK(relevance: boolean[]): number {
  const totalRelevant = relevance.filter(Boolean).length;
  if (totalRelevant === 0) return 0;

  let score = 0;
  let relevantSoFar = 0;
  for (let k = 0; k < relevance.length; k++) {
    if (relevance[k]) {
      relevantSoFar++;
      const precisionAtK = relevantSoFar / (k + 1);
      score += precisionAtK;
    }
  }
  return score / totalRelevant;
}

/** 计算 Context Precision 指标 */
export async function contextPrecision(
  sample: EvalSample
): Promise<MetricTrace> {
  if (sample.contexts.length === 0) {
    return {
      metric: "context_precision",
      score: 0,
      details: { reason: "no contexts provided" },
    };
  }

  const relevance = await judgeRelevance(sample.question, sample.contexts);
  const score = weightedPrecisionAtK(relevance);

  return {
    metric: "context_precision",
    score,
    details: {
      relevance_judgments: sample.contexts.map((_, i) => ({
        chunk_index: i,
        relevant: relevance[i],
      })),
      total_relevant: relevance.filter(Boolean).length,
      total_chunks: relevance.length,
    },
  };
}
