/**
 * 复杂度分类器：用轻量模型快速判断 simple / complex
 * 失败默认 simple，不阻塞用户
 */
import { generateObject } from "ai";
import { z } from "zod";
import { dashscopeProvider } from "@/lib/llm/llm";
import { MODEL_LIGHT } from "@/lib/llm/models";

const schema = z.object({
  complexity: z.enum(["simple", "complex"]),
  sub_tasks: z
    .array(z.string())
    .optional()
    .describe("复杂问题的子任务列表（可选）"),
});

const CLASSIFY_PROMPT = `你是一个问题复杂度分类器。根据用户问题判断是 simple 还是 complex。

**simple**：单工具、单步骤即可回答
- 单一知识问题：流程、政策、FAQ、配方/做法（如"报销流程"、"年假多少天"、"生椰拿铁如何制作"、"XX产品说明书"）——仅需一次 search_knowledge
- 单一数据查询（如"上个月销量"、"各产品销量对比"、"销售额最高的哪个"）——仅需一次 execute_query

**complex**：需要多步骤或多工具
- 含"并且"、"同时"、"结合"、"然后"等连接词，明确要求多件事
- 需要知识库 + 数据表联合回答（如"结合销量数据和产品说明分析"）
- 需先查数据，再用结果检索知识（如"销量最高的产品是哪个，再找它的说明书"）
- 模糊指令需拆解成多个子问题

用户问题：{{userMessage}}

输出 JSON：{ "complexity": "simple"|"complex", "sub_tasks": ["子任务1", "子任务2"] }
complex 时 sub_tasks 可选；simple 时 sub_tasks 为空或省略。`;

export interface ClassifyResult {
  complexity: "simple" | "complex";
  sub_tasks?: string[];
}

export async function classifyComplexity(
  userMessage: string,
  _options?: {
    hasKnowledge?: boolean;
    hasTables?: boolean;
  }
): Promise<ClassifyResult> {
  const prompt = CLASSIFY_PROMPT.replace("{{userMessage}}", userMessage);

  try {
    const { object } = await generateObject({
      model: dashscopeProvider(MODEL_LIGHT),
      schema,
      prompt,
      maxTokens: 256,
    });

    return {
      complexity: object.complexity as "simple" | "complex",
      sub_tasks: object.sub_tasks,
    };
  } catch {
    return { complexity: "simple" };
  }
}
