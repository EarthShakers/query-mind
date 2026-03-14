/**
 * Agent 各节点提示词（ChatPromptTemplate）
 */
import { ChatPromptTemplate } from "@langchain/core/prompts";

/** 规划节点：拆解用户问题为子任务 */
export const planPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是一个任务规划器。根据用户问题，判断是否需要使用工具，并拆解为可执行的子任务。

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
1. 如果问题是通用常识（如烹饪方法、科普知识、生活技巧、日常问答），不需要知识库或数据查询，直接返回空的 sub_tasks：
   {{"strategy": "通用常识问题，直接回答", "sub_tasks": []}}
2. 子任务按依赖顺序排列，被依赖的在前
3. 若需先查数据再用结果检索（如"销量最高的产品说明"），st1 用 execute_query，st2 用 search_knowledge 且 depends_on: ["st1"]
4. Schema 为空或无相关表时，系统会自动改为 search_knowledge，你仍可输出 execute_query 作为占位
5. 单工具问题只生成一个 sub_task`,
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
    `你是一位智能助手。根据用户问题和工具执行结果，生成准确、详细的最终回答。

要求：
1. 直接回答用户问题，内容详实（用户要求简短时除外）
2. 如果有工具结果，基于工具返回的真实数据回答，严禁编造
3. 如果没有工具结果（工具执行结果为空 {{}}），说明这是通用知识问题，请直接用你自身的知识详细回答
4. 若某部分无结果，如实告知
5. 用自然语言组织回答，条理清晰`,
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
