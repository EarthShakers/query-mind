/**
 * Faithfulness（忠实度）- RAGAS 方法
 *
 * Step 1: LLM 将 answer 分解为原子声明（claims）
 * Step 2: LLM 逐条判断每个 claim 是否被 contexts 支持
 * Score = supported_claims / total_claims
 */
import { getDashScopeLLM } from "../../src/lib/llm/llm";
import { MODEL_LIGHT } from "../../src/lib/llm/models";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import type { EvalSample, MetricTrace } from "../types";

const ClaimsSchema = z.object({
  claims: z
    .array(z.string())
    .describe("从答案中提取的原子声明列表，每条声明是一个独立的事实陈述"),
});

const VerificationSchema = z.object({
  results: z
    .array(
      z.object({
        claim: z.string().describe("原子声明"),
        supported: z.boolean().describe("该声明是否能从上下文中推断或验证"),
      })
    )
    .describe("每条声明的验证结果"),
});

/** Step 1: 分解答案为原子声明 */
async function decomposeClaims(answer: string): Promise<string[]> {
  const llm = getDashScopeLLM({ model: MODEL_LIGHT, maxTokens: 512 });
  const structured = llm.withStructuredOutput(ClaimsSchema, { method: "jsonMode" });
  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `将给定的答案分解为独立的原子声明（atomic claims）。
每条声明应该是一个独立的、可验证的事实陈述。
去掉纯语气词和无实质信息的片段。
请以 JSON 格式返回，格式为：{{"claims": ["声明1", "声明2", ...]}}`,
    ],
    ["human", "答案：{answer}"],
  ]);

  const result = await prompt.pipe(structured).invoke({ answer });
  return (
    (result as z.infer<typeof ClaimsSchema>)?.claims?.filter((c) =>
      c?.trim()
    ) ?? [answer]
  );
}

/** Step 2: 逐条验证声明是否被 contexts 支持 */
async function verifyClaims(
  claims: string[],
  contexts: string[]
): Promise<{ claim: string; supported: boolean }[]> {
  const llm = getDashScopeLLM({ model: MODEL_LIGHT, maxTokens: 1024 });
  const structured = llm.withStructuredOutput(VerificationSchema, { method: "jsonMode" });
  const contextStr = contexts.join("\n\n---\n\n").slice(0, 6000);

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `你是一个事实核查员。对于每条声明，判断它是否能从给定的上下文中推断或得到支持。
仅当上下文中包含足够信息来支持该声明时，才标记为 supported: true。
如果上下文中没有相关信息、或信息不足以验证该声明，标记为 supported: false。
请以 JSON 格式返回，格式为：{{"results": [{{"claim": "...", "supported": true/false}}, ...]}}`,
    ],
    [
      "human",
      `上下文：
{context}

需验证的声明：
{claims}`,
    ],
  ]);

  const claimsStr = claims.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const result = await prompt.pipe(structured).invoke({
    context: contextStr,
    claims: claimsStr,
  });

  const verified = (result as z.infer<typeof VerificationSchema>)?.results;
  if (!verified || verified.length === 0) {
    return claims.map((c) => ({ claim: c, supported: false }));
  }
  return verified;
}

/** 计算 Faithfulness 指标 */
export async function faithfulness(sample: EvalSample): Promise<MetricTrace> {
  if (sample.contexts.length === 0) {
    return {
      metric: "faithfulness",
      score: 0,
      details: { reason: "no contexts provided" },
    };
  }

  const claims = await decomposeClaims(sample.answer);
  const verifications = await verifyClaims(claims, sample.contexts);
  const supported = verifications.filter((v) => v.supported).length;
  const total = verifications.length;
  const score = total > 0 ? supported / total : 0;

  return {
    metric: "faithfulness",
    score,
    details: {
      claims,
      verifications,
      supported_count: supported,
      total_count: total,
    },
  };
}
