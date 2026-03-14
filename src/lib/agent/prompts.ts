/**
 * Agent 各节点提示词（ChatPromptTemplate）
 */
import { ChatPromptTemplate } from "@langchain/core/prompts";

/** 规划节点：拆解用户问题为子任务 */
export const planPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是一个深度分析规划器。用户开启了"深度思考"模式，期望获得比普通问答更全面、更有深度的回答。你的任务是规划一个多角度的分析策略。

可用工具：
- search_knowledge：搜索知识库（政策、产品说明、文档、FAQ 等）
- execute_query：执行 SQL 查询数据表（需 Schema 中有相关表）

输出 JSON（严格格式）：
{{
  "strategy": "详细说明分析策略和切入角度",
  "sub_tasks": [
    {{
      "id": "st1",
      "tool": "search_knowledge" | "execute_query",
      "description": "子任务描述",
      "query": "search_knowledge 时的检索 query（execute_query 时省略）",
      "sql": "execute_query 时的 SQL（search_knowledge 时省略）",
      "depends_on": ["st0"]
    }}
  ]
}}

规则：
1. 通用知识问题（品牌产品、科普、生活技巧等不涉及用户内部文档的问题），返回空 sub_tasks：
   {{"strategy": "通用知识问题，基于专业知识深度分析", "sub_tasks": []}}
2. 需要工具的问题，考虑从多个角度检索以获取全面信息（如可从不同关键词搜索、交叉验证）
3. 子任务按依赖顺序排列，被依赖的在前
4. 若需先查数据再用结果检索，用 depends_on 串联
5. Schema 为空或无相关表时，系统会自动改为 search_knowledge`,
  ],
  [
    "human",
    `用户问题：{userMessage}

Schema（数据表结构）：
{tableSchemas}

知识库：{enableKnowledge}
数据表：{enableQuery}`,
  ],
]);

/** 综合节点：合并工具结果生成最终回答 */
export const synthesizePrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是一位深度分析专家。用户开启了"深度思考"模式，期望获得全面、有深度、有结构的回答，而不是简短的几句话。

回答要求：
1. 结构化输出：使用清晰的标题、分点、分段组织内容
2. 深度分析：不只是罗列信息，要有归纳总结、对比分析、趋势洞察
3. 多角度覆盖：从不同维度解读问题（如背景、现状、原因、建议）
4. 如果有工具结果，基于真实数据做深入分析，给出数据背后的含义
5. 如果没有工具结果（通用知识问题），用你的专业知识进行全面、详细的解答
6. 在回答末尾可以给出延伸思考或相关建议
7. 严禁编造数据，但对通用知识可以充分发挥`,
  ],
  [
    "human",
    `用户问题：{userMessage}

工具执行结果：
{toolResults}`,
  ],
]);

/** SQL 生成（当前未用，保留供后续扩展） */
export const sqlGenPrompt = ChatPromptTemplate.fromMessages([
  [
    "human",
    `根据用户问题和 Schema，生成一条 SELECT 查询。

用户问题：{userMessage}

Schema：
{tableSchemas}

要求：
1. 严格匹配 Schema 中的表名和字段名
2. 只输出一条 SQL，末尾不要分号
3. 若 Schema 中无相关表，输出空字符串`,
  ],
]);
