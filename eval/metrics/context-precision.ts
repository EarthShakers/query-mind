/**
 * Context Precision（上下文精确度）- RAGAS 方法
 *
 * Step 1: LLM 判断每个 context chunk 是否与问题相关
 * Step 2: 使用排序加权 precision@k 计算得分
 * Score = (1/total_relevant) * sum(precision_at_k * is_relevant_k)
 *
 * 奖励将相关文档排在前面的检索系统
 */
import { getDashScopeLLM } from "../../src/lib/llm";
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
  const llm = getDashScopeLLM({ model: "qwen-turbo", maxTokens: 512 });
  const structured = llm.withStructuredOutput(RelevanceJudgmentSchema);

  const chunksStr = contexts
    .map((c, i) => `[Chunk ${i + 1}]\n${c.slice(0, 500)}`)
    .join("\n\n");

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `你是一个检索质量评估员。对于给定的问题和一组检索到的文档片段，判断每个片段是否包含与问题相关的有用信息。
只要片段中包含能帮助回答问题的信息，就标记为 relevant: true。
如果片段完全无关或仅有极微弱的关联，标记为 relevant: false。`,
    ],
    [
      "human",
      `问题：{question}

检索到的文档片段：
{chunks}`,
    ],
  ]);

  const result = await prompt.pipe(structured).invoke({
    question,
    chunks: chunksStr,
  });

  const judgments = (result as z.infer<typeof RelevanceJudgmentSchema>)
    ?.judgments;
  if (!judgments || judgments.length === 0) {
    return contexts.map(() => false);
  }

  // 按 index 映射回布尔数组
  const relevanceMap = new Map(judgments.map((j) => [j.index, j.relevant]));
  return contexts.map((_, i) => relevanceMap.get(i + 1) ?? false);
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
