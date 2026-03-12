/**
 * Agent 各节点提示词（ChatPromptTemplate）
 */
import { ChatPromptTemplate } from "@langchain/core/prompts";

/** 规划节点：拆解用户问题为子任务 */
export const planPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是一个任务规划器。根据用户问题，拆解为可执行的子任务。

可用工具：
- search_knowledge：搜索知识库（政策、产品说明、文档、FAQ 等）
- execute_query：执行 SQL 查询数据表（需 Schema 中有相关表）

输出 JSON（严格格式）：
{{
  "strategy": "简要说明执行策略",
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
1. 子任务按依赖顺序排列，被依赖的在前
2. 若需先查数据再用结果检索（如"销量最高的产品说明"），st1 用 execute_query，st2 用 search_knowledge 且 depends_on: ["st1"]
3. Schema 为空或无相关表时，系统会自动改为 search_knowledge，你仍可输出 execute_query 作为占位
4. 单工具问题只生成一个 sub_task`,
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
    `你是一位资深知识管理与数据分析专家。根据工具执行结果，生成简洁、准确的最终回答。

要求：
1. 直接回答用户问题，3-8 句话（用户要求详细时除外）
2. 基于工具返回的真实数据，严禁编造
3. 若某部分无结果，如实告知
4. 用自然语言概括，不要堆砌原始数据`,
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
