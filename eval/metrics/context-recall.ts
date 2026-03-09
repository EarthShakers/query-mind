/**
 * Context Recall（上下文召回）- RAGAS 方法
 *
 * Step 1: LLM 将 ground_truth 分解为原子声明
 * Step 2: LLM 检查每个声明是否被 contexts 覆盖
 * Score = covered_claims / total_claims
 *
 * 需要 ground_truth，若缺失则返回 0
 */
import { getDashScopeLLM } from "../../src/lib/llm";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import type { EvalSample, MetricTrace } from "../types";

const ClaimsSchema = z.object({
  claims: z
    .array(z.string())
    .describe("从参考答案中提取的原子声明列表"),
});

const AttributionSchema = z.object({
  results: z
    .array(
      z.object({
        claim: z.string().describe("原子声明"),
        covered: z
          .boolean()
          .describe("该声明是否能在检索上下文中找到支持"),
      })
    )
    .describe("每条声明的覆盖情况"),
});

/** Step 1: 将 ground_truth 分解为原子声明 */
async function decomposeGroundTruth(groundTruth: string): Promise<string[]> {
  const llm = getDashScopeLLM({ model: "qwen-turbo", maxTokens: 512 });
  const structured = llm.withStructuredOutput(ClaimsSchema);
  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `将给定的参考答案分解为独立的原子声明（atomic claims）。
每条声明应该是一个独立的、可验证的事实陈述。
确保覆盖参考答案中的所有关键信息。`,
    ],
    ["human", "参考答案：{ground_truth}"],
  ]);

  const result = await prompt.pipe(structured).invoke({ ground_truth: groundTruth });
  return (result as z.infer<typeof ClaimsSchema>)?.claims?.filter(
    (c) => c?.trim()
  ) ?? [groundTruth];
}

/** Step 2: 检查每个声明是否被 contexts 覆盖 */
async function checkCoverage(
  claims: string[],
  contexts: string[]
): Promise<{ claim: string; covered: boolean }[]> {
  const llm = getDashScopeLLM({ model: "qwen-turbo", maxTokens: 1024 });
  const structured = llm.withStructuredOutput(AttributionSchema);
  const contextStr = contexts.join("\n\n---\n\n").slice(0, 6000);

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `你是一个信息覆盖率检查员。对于每条声明，判断给定的检索上下文是否包含支持该声明的信息。
只要上下文中有信息能够支持或包含该声明的核心内容，就标记为 covered: true。
如果上下文中完全没有相关信息，标记为 covered: false。`,
    ],
    [
      "human",
      `检索上下文：
{context}

需检查覆盖情况的声明：
{claims}`,
    ],
  ]);

  const claimsStr = claims.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const result = await prompt.pipe(structured).invoke({
    context: contextStr,
    claims: claimsStr,
  });

  const results = (result as z.infer<typeof AttributionSchema>)?.results;
  if (!results || results.length === 0) {
    return claims.map((c) => ({ claim: c, covered: false }));
  }
  return results;
}

/** 计算 Context Recall 指标 */
export async function contextRecall(
  sample: EvalSample
): Promise<MetricTrace> {
  if (!sample.ground_truth) {
    return {
      metric: "context_recall",
      score: 0,
      details: { reason: "no ground_truth provided" },
    };
  }

  if (sample.contexts.length === 0) {
    return {
      metric: "context_recall",
      score: 0,
      details: { reason: "no contexts provided" },
    };
  }

  const claims = await decomposeGroundTruth(sample.ground_truth);
  const coverageResults = await checkCoverage(claims, sample.contexts);
  const covered = coverageResults.filter((r) => r.covered).length;
  const total = coverageResults.length;
  const score = total > 0 ? covered / total : 0;

  return {
    metric: "context_recall",
    score,
    details: {
      ground_truth_claims: claims,
      coverage: coverageResults,
      covered_count: covered,
      total_count: total,
    },
  };
}
