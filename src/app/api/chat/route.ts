import { streamText, type CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { query, getSchema } from "@/lib/db";

const dashscope = createOpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});

// useChat sends messages with toolInvocations that streamText can't convert.
// Strip everything except role + content text.
function sanitizeMessages(
  raw: { role: string; content: string; [k: string]: unknown }[]
): CoreMessage[] {
  const cleaned: CoreMessage[] = [];
  for (const m of raw) {
    if (m.role === "user") {
      cleaned.push({ role: "user", content: m.content });
    } else if (m.role === "assistant" && m.content) {
      cleaned.push({ role: "assistant", content: m.content });
    }
    // drop assistant messages that are empty or only have toolInvocations
  }
  return cleaned;
}

export async function POST(req: Request) {
  const { messages } = await req.json();

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 30000);

  try {
    const result = await streamText({
      model: dashscope("deepseek-v3.2"),
      abortSignal: abortController.signal,
      maxSteps: 3,
      system: `你是一个 SQL 助手。数据库 schema：
${getSchema()}

你必须根据用户问题选择合适的工具：

**数据准确性规则：**
- 仔细阅读上方 schema 中的数据。如果用户查询的对象（产品名、部门名、员工名等）在 schema 和已知数据中明显不存在，**直接用文字回复告知用户"未找到相关数据"，并列出数据库中可用的选项**，不要调用任何工具
- 不要用相似名称的数据替代用户查询的目标（例如用户问"电子烟"，不要替换成"电子产品"）
- 只有在用户查询的对象确实存在或你需要聚合/统计已有数据时，才调用工具

**必须使用 show_chart 的场景（优先判断）：**
- 用户提到"趋势"、"变化"、"走势" → chartType: "line"
- 用户提到"对比"、"比较"、"排名"、"各部门"、"每个" → chartType: "bar"
- 用户提到"占比"、"比例"、"分布"、"构成" → chartType: "pie"
- 用户提到"图"、"图表"、"可视化"、"画" → 根据语义选择 chartType

**groupKey 使用规则：**
- 当需要在同一张图中对比不同类别时，必须设置 groupKey
- 例如"对比产品A和产品B的销售额" → xKey: "month", yKey: "amount", groupKey: "product"
- 例如"各部门薪资对比" → xKey: "department", yKey: "salary"（无需 groupKey，每个柱子就是一个部门）

**使用 execute_query 的场景：**
- 用户要求查看具体数据列表、明细、所有记录
- 用户问具体某个值（如"张三的薪资是多少"）

**SQL 错误自动修复：**
- 如果工具执行返回错误信息，请仔细阅读错误内容，对照 schema 修正 SQL 后重新调用工具
- 常见错误：字段名拼写错误、表名错误、JOIN 条件遗漏

请务必正确选择工具，不要总是使用 execute_query。`,
      messages: sanitizeMessages(messages),
      tools: {
        execute_query: {
          description: "Execute a SQL query and display results as a table",
          parameters: z.object({
            sql: z.string().describe("The SQLite query to execute"),
          }),
          execute: async ({ sql }) => {
            try {
              const data = query(sql);
              return { sql, data };
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              return { sql, data: [], error: msg };
            }
          },
        },
        show_chart: {
          description:
            "MUST use this tool when user asks about trends, comparisons, rankings, distributions, proportions, or any visualization. Execute SQL and render as chart.",
          parameters: z.object({
            sql: z.string().describe("The SQLite query to execute"),
            chartType: z.enum(["bar", "line", "pie"]).describe("Chart type"),
            xKey: z.string().describe("Column name for X axis"),
            yKey: z.string().describe("Column name for Y axis / values"),
            groupKey: z
              .string()
              .optional()
              .describe(
                "Column name to group/split data by (e.g. 'product' for comparing products). When set, each unique value becomes a separate colored series."
              ),
          }),
          execute: async ({ sql, chartType, xKey, yKey, groupKey }) => {
            try {
              const data = query(sql);
              return { sql, data, chartType, xKey, yKey, groupKey };
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              return {
                sql,
                data: [],
                chartType,
                xKey,
                yKey,
                groupKey,
                error: msg,
              };
            }
          },
        },
      },
    });

    clearTimeout(timeout);
    return result.toDataStreamResponse();
  } catch {
    clearTimeout(timeout);
    return new Response(JSON.stringify({ error: "请求超时或失败，请重试" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
