import { streamText, type CoreMessage } from "ai";
import { z } from "zod";
import { queryUserData } from "@/lib/pg";
import { getUserTableSchemas, formatUserSchemas } from "@/lib/excel-parser";
import { searchWithSelfQuery } from "@/lib/rag";
import { buildSystemPrompt } from "@/lib/prompt";
import { getSpaceContext } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { dashscopeProvider } from "@/lib/llm";
import {
  checkRateLimit,
  checkDailyBudget,
  checkInputLength,
  recordTokenUsage,
} from "@/lib/ratelimit";

/** useChat 发送的 messages 含 toolInvocations，streamText 无法解析，需要清洗 */
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
  }
  return cleaned;
}

/** Route a SQL query to PostgreSQL (user-uploaded tables) */
async function executeQuery(sql: string): Promise<Record<string, unknown>[]> {
  return queryUserData(sql);
}

export async function POST(req: Request) {
  // ── 前置校验 ──
  const blocked = (await checkRateLimit(req)) ?? (await checkDailyBudget());
  if (blocked) return blocked;

  const { messages, spaceIds: clientSpaceIds, reportId } = await req.json();

  const lastMsg = messages[messages.length - 1]?.content ?? "";
  const inputBlocked = checkInputLength(lastMsg);
  if (inputBlocked) return inputBlocked;

  const ctx = getSpaceContext(req);
  const { tenantRole, activeSpaceId } = ctx;

  // Determine searchable spaces
  // If client sends explicit spaceIds array, use it directly
  // Empty array = no knowledge search, only SQL data queries
  let searchSpaceIds: string[];
  if (Array.isArray(clientSpaceIds)) {
    searchSpaceIds = clientSpaceIds.filter(
      (id: unknown) => typeof id === "string" && id.length > 0
    );
  } else if (tenantRole) {
    searchSpaceIds = activeSpaceId ? [activeSpaceId] : [];
  } else {
    searchSpaceIds = activeSpaceId ? [activeSpaceId] : [];
  }

  const enableKnowledge = searchSpaceIds.length > 0;

  // Fetch user-uploaded table schemas for selected spaces
  const allSpaceIds = Array.isArray(clientSpaceIds)
    ? clientSpaceIds.filter(
        (id: unknown) => typeof id === "string" && id.length > 0
      )
    : searchSpaceIds;
  let userSchemaStr: string | undefined;
  try {
    const userSchemas = await getUserTableSchemas(allSpaceIds);
    if (userSchemas.length > 0) {
      userSchemaStr = formatUserSchemas(userSchemas);
    }
  } catch {
    // If DATABASE_URL is not configured, skip user tables
  }

  // Load existing report sections for context (when in report mode)
  // Also activate report mode if user's message mentions "报告" (even without reportId yet)
  let existingSections:
    | {
        section_id: string;
        sort_order: number;
        title?: string;
        content_type: string;
      }[]
    | undefined;
  const isReportRequest = !reportId && /报告|report/i.test(lastMsg);
  if (reportId) {
    const { data } = await supabase
      .from("report_sections")
      .select("section_id, sort_order, title, content_type")
      .eq("report_id", reportId)
      .order("sort_order");
    if (data && data.length > 0) {
      existingSections = data;
    } else {
      // reportId exists but no sections yet — still activate report mode
      existingSections = [];
    }
  } else if (isReportRequest) {
    // No reportId yet but user asked for a report — activate report mode with empty sections
    existingSections = [];
  }

  const isReportMode = reportId || isReportRequest;

  // ── AI 流式调用 ──
  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(),
    isReportMode ? 120000 : 60000
  );

  try {
    const result = await streamText({
      model: dashscopeProvider("deepseek-v3"),
      abortSignal: abortController.signal,
      maxSteps: isReportMode ? 10 : 5,
      system: buildSystemPrompt(userSchemaStr, existingSections),
      messages: sanitizeMessages(messages),
      tools: {
        // 结构化数据sql查询
        execute_query: {
          description: "Execute a SQL query and display results as a table",
          parameters: z.object({
            sql: z.string().describe("The SQL query to execute"),
          }),
          execute: async ({ sql }) => {
            try {
              return { sql, data: await executeQuery(sql) };
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              return { sql, data: [], error: msg };
            }
          },
        },
        // 图表生成
        show_chart: {
          description:
            "Generate and display a chart. Only use when user EXPLICITLY requests a chart (e.g. '用图表展示', '生成图表').",
          parameters: z.object({
            sql: z.string().describe("The SQL query to execute"),
            chartType: z.enum(["bar", "line", "pie"]).describe("Chart type"),
            xKey: z.string().describe("Column name for X axis"),
            yKey: z.string().describe("Column name for Y axis / values"),
            groupKey: z
              .string()
              .optional()
              .describe(
                "Column to group/split data by. Each unique value becomes a separate series."
              ),
          }),
          execute: async ({ sql, chartType, xKey, yKey, groupKey }) => {
            try {
              return {
                sql,
                data: await executeQuery(sql),
                chartType,
                xKey,
                yKey,
                groupKey,
              };
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
        // 图表建议
        suggest_chart: {
          description:
            "Suggest a chart visualization to the user. Use after answering with text, when the data would benefit from a chart. The user can then choose to view it.",
          parameters: z.object({
            sql: z.string().describe("The SQL query for the chart"),
            chartType: z.enum(["bar", "line", "pie"]).describe("Chart type"),
            xKey: z.string().describe("Column name for X axis"),
            yKey: z.string().describe("Column name for Y axis / values"),
            groupKey: z
              .string()
              .optional()
              .describe("Column to group/split data by."),
          }),
          execute: async ({ sql, chartType, xKey, yKey, groupKey }) => {
            try {
              return {
                sql,
                data: await executeQuery(sql),
                chartType,
                xKey,
                yKey,
                groupKey,
              };
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
        // 写入或更新报告
        write_report_section: {
          description:
            "【报告模式必须调用】写入或更新报告的一个章节。报告模式下，必须通过此工具输出内容，每个章节调用一次，禁止只用文字回复。修改已有章节时复用相同 section_id。",
          parameters: z.object({
            section_id: z
              .string()
              .describe('章节唯一标识，如 "intro", "s1", "chart-revenue"'),
            sort_order: z.number().describe("章节排序位置，1, 2, 3..."),
            title: z.string().optional().describe("章节标题，可省略"),
            content_type: z
              .enum(["markdown", "chart", "table"])
              .describe("内容类型：markdown 文字、chart 图表、table 数据表"),
            content_markdown: z
              .string()
              .optional()
              .describe("Markdown 文字内容，content_type 为 markdown 时必填"),
            chart_sql: z
              .string()
              .optional()
              .describe("图表数据的 SQL 查询，content_type 为 chart 时必填"),
            chart_type: z
              .enum(["bar", "line", "pie"])
              .optional()
              .describe("图表类型，content_type 为 chart 时必填"),
            chart_x_key: z
              .string()
              .optional()
              .describe("X 轴字段名，content_type 为 chart 时必填"),
            chart_y_key: z
              .string()
              .optional()
              .describe("Y 轴字段名，content_type 为 chart 时必填"),
            chart_group_key: z
              .string()
              .optional()
              .describe("分组字段名，用于多系列图表"),
            table_sql: z
              .string()
              .optional()
              .describe("数据表的 SQL 查询，content_type 为 table 时必填"),
          }),
          execute: async (args) => {
            if (args.content_type === "chart") {
              if (!args.chart_sql) {
                return {
                  section_id: args.section_id,
                  sort_order: args.sort_order,
                  title: args.title,
                  content_type: "chart" as const,
                  error: "缺少 chart_sql 参数，无法生成图表",
                };
              }
              try {
                const data = await executeQuery(args.chart_sql);
                // Auto-infer xKey/yKey from data columns if LLM didn't provide them
                const columns = data.length > 0 ? Object.keys(data[0]) : [];
                let xKey = args.chart_x_key || "";
                let yKey = args.chart_y_key || "";
                if (columns.length >= 2) {
                  if (!xKey) xKey = columns[0];
                  if (!yKey)
                    yKey = columns.find((c) => c !== xKey) || columns[1];
                }
                return {
                  section_id: args.section_id,
                  sort_order: args.sort_order,
                  title: args.title,
                  content_type: args.content_type,
                  chart_config: {
                    data,
                    chartType: args.chart_type || "bar",
                    xKey,
                    yKey,
                    groupKey: args.chart_group_key,
                  },
                };
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                return { ...args, error: msg };
              }
            }
            if (args.content_type === "table") {
              if (!args.table_sql) {
                return {
                  section_id: args.section_id,
                  sort_order: args.sort_order,
                  title: args.title,
                  content_type: "table" as const,
                  error: "缺少 table_sql 参数，无法生成数据表",
                };
              }
              try {
                const data = await executeQuery(args.table_sql);
                return {
                  section_id: args.section_id,
                  sort_order: args.sort_order,
                  title: args.title,
                  content_type: args.content_type,
                  table_data: { data },
                };
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                return { ...args, error: msg };
              }
            }
            // markdown passthrough
            return {
              section_id: args.section_id,
              sort_order: args.sort_order,
              title: args.title,
              content_type: args.content_type,
              content_markdown: args.content_markdown,
            };
          },
        },
        ...(enableKnowledge
          ? {
              // 知识库检索 RAG（Self-Query：LangChain 解析 query + filter，便于 debug）
              search_knowledge: {
                description:
                  "Search the knowledge base for company policies, product docs, FAQs, and general information. Some chunks may include markdown images. Use when the question is NOT about querying database numbers or statistics. Pass the user's exact question.",
                parameters: z.object({
                  query: z
                    .string()
                    .describe("The user's exact question, verbatim from their message"),
                }),
                execute: async ({ query: q }) => {
                  try {
                    const results = await searchWithSelfQuery(lastMsg || q, 5, searchSpaceIds);
                    return { query: lastMsg || q, results };
                  } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : String(e);
                    return { query: q, results: [], error: msg };
                  }
                },
              },
            }
          : {}),
      },
    });

    clearTimeout(timeout);

    // 异步记录 token 用量（不阻塞响应）
    result.usage.then((u) => recordTokenUsage(u.totalTokens)).catch(() => {});

    return result.toDataStreamResponse();
  } catch {
    clearTimeout(timeout);
    return new Response(JSON.stringify({ error: "请求超时或失败，请重试" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
