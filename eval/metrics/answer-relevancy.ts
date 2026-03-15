/**
 * Answer Relevancy（答案相关性）- RAGAS 方法
 *
 * Step 1: LLM 根据 answer 反向生成 N 个问题
 * Step 2: Embed 原始问题 + 生成的问题
 * Step 3: 计算每个生成问题与原始问题的余弦相似度
 * Score = mean(similarities)
 */
import { getDashScopeLLM } from "../../src/lib/llm/llm";
import { getModelLight } from "../../src/lib/llm/model-config";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { batchEmbed, cosineSimilarity, clamp01 } from "../utils";
import type { EvalSample, MetricTrace } from "../types";

const NUM_QUESTIONS = 3;

const GeneratedQuestionsSchema = z.object({
  questions: z
    .array(z.string())
    .min(1)
    .max(NUM_QUESTIONS)
    .describe("根据答案反向生成的问题"),
});

/** Step 1: 根据 answer 反向生成问题 */
async function generateQuestions(answer: string): Promise<string[]> {
  const llm = getDashScopeLLM({ model: getModelLight(), maxTokens: 300 });
  const structured = llm.withStructuredOutput(GeneratedQuestionsSchema, { method: "jsonMode" });
  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `根据给定的答案，生成 ${NUM_QUESTIONS} 个该答案可能回答的问题。
问题应尽量多样化，覆盖答案中的不同方面。
每个问题应该是一个完整的、自然的疑问句。
请以 JSON 格式返回，格式为：{{"questions": ["问题1", "问题2", ...]}}`,
    ],
    ["human", "答案：{answer}"],
  ]);

  const result = await prompt.pipe(structured).invoke({ answer });
  return (
    (result as z.infer<typeof GeneratedQuestionsSchema>)?.questions?.filter(
      (q) => q?.trim()
    ) ?? []
  );
}

/** 计算 Answer Relevancy 指标 */
export async function answerRelevancy(
  sample: EvalSample
): Promise<MetricTrace> {
  const generatedQuestions = await generateQuestions(sample.answer);
  if (generatedQuestions.length === 0) {
    return {
      metric: "answer_relevancy",
      score: 0,
      details: { reason: "failed to generate questions from answer" },
    };
  }

  // embed 原始问题 + 生成的问题
  const allTexts = [sample.question, ...generatedQuestions];
  const embeddings = await batchEmbed(allTexts);
  const originalEmb = embeddings[0];
  const generatedEmbs = embeddings.slice(1);

  // 计算每个生成问题与原始问题的相似度
  const similarities = generatedEmbs.map((emb) =>
    cosineSimilarity(originalEmb, emb)
  );
  const score = clamp01(
    similarities.reduce((a, b) => a + b, 0) / similarities.length
  );

  return {
    metric: "answer_relevancy",
    score,
    details: {
      generated_questions: generatedQuestions,
      similarities,
    },
  };
}
