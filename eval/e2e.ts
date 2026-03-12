/**
 * E2E 评估：question -> RAG pipeline -> LLM -> evaluate
 * 需要 Supabase 环境变量
 */
import { getDashScopeLLM } from "../src/lib/llm/llm";
import { MODEL_LIGHT } from "../src/lib/llm/models";
import { searchWithRagEnhanced } from "../src/lib/rag/rag-enhanced";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import type { EvalSample, MetricName } from "./types";
import { evaluate } from "./evaluate";

interface E2EInput {
  question: string;
  ground_truth?: string;
}

/** 用 RAG pipeline 生成完整的 EvalSample */
async function generateSample(
  input: E2EInput,
  spaceIds?: string[]
): Promise<EvalSample> {
  // 1. 检索
  const results = await searchWithRagEnhanced(input.question, spaceIds);
  const contexts = results.map((r) => `${r.title}\n\n${r.content}`);

  // 2. 生成
  const llm = getDashScopeLLM({ model: MODEL_LIGHT, maxTokens: 1024 });
  const contextStr = contexts.join("\n\n---\n\n").slice(0, 6000);
  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `你是一个知识助手。基于以下检索到的上下文回答用户问题。
如果上下文中没有足够信息，请明确说明。不要编造信息。

检索上下文：
{context}`,
    ],
    ["human", "{question}"],
  ]);

  const response = await prompt.pipe(llm).invoke({
    context: contextStr,
    question: input.question,
  });

  const answer =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

  return {
    question: input.question,
    contexts,
    answer,
    ground_truth: input.ground_truth,
  };
}

/** E2E 评估入口 */
export async function evaluateE2E(
  inputs: E2EInput[],
  options?: {
    metrics?: MetricName[];
    delayMs?: number;
    spaceIds?: string[];
    onSampleGenerated?: (index: number, sample: EvalSample) => void;
  }
) {
  const dataset: EvalSample[] = [];
  for (let i = 0; i < inputs.length; i++) {
    console.log(
      `[E2E] 生成样本 ${i + 1}/${inputs.length}: ${inputs[i].question}`
    );
    const sample = await generateSample(inputs[i], options?.spaceIds);
    dataset.push(sample);
    options?.onSampleGenerated?.(i, sample);
  }

  console.log(`[E2E] 样本生成完成，开始评估...`);
  return evaluate(dataset, {
    metrics: options?.metrics,
    delayMs: options?.delayMs,
  });
}
