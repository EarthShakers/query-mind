import { streamText, type CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { query } from "@/lib/db";
import { searchDocuments } from "@/lib/rag";
import { buildSystemPrompt } from "@/lib/prompt";
import { getSpaceContext, DEMO_SPACE_ID } from "@/lib/auth";
import {
  checkRateLimit,
  checkDailyBudget,
  checkInputLength,
  recordTokenUsage,
} from "@/lib/ratelimit";

const dashscope = createOpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});

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

export async function POST(req: Request) {
  // ── 前置校验 ──
  const blocked =
    (await checkRateLimit(req)) ?? (await checkDailyBudget());
  if (blocked) return blocked;

  const { messages, spaceIds: clientSpaceIds } = await req.json();

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
    searchSpaceIds = [activeSpaceId || DEMO_SPACE_ID];
  } else {
    searchSpaceIds = activeSpaceId && activeSpaceId !== DEMO_SPACE_ID
      ? [DEMO_SPACE_ID, activeSpaceId]
      : [DEMO_SPACE_ID];
  }

  const enableKnowledge = searchSpaceIds.length > 0;

  // ── AI 流式调用 ──
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 30000);

  try {
    const result = await streamText({
      model: dashscope("deepseek-v3.2"),
      abortSignal: abortController.signal,
      maxSteps: 3,
      system: buildSystemPrompt(),
      messages: sanitizeMessages(messages),
      tools: {
        execute_query: {
          description: "Execute a SQL query and display results as a table",
          parameters: z.object({
            sql: z.string().describe("The SQLite query to execute"),
          }),
          execute: async ({ sql }) => {
            try {
              return { sql, data: query(sql) };
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              return { sql, data: [], error: msg };
            }
          },
        },
        show_chart: {
          description:
            "Generate and display a chart. Only use when user EXPLICITLY requests a chart (e.g. '用图表展示', '生成图表').",
          parameters: z.object({
            sql: z.string().describe("The SQLite query to execute"),
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
              return { sql, data: query(sql), chartType, xKey, yKey, groupKey };
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              return { sql, data: [], chartType, xKey, yKey, groupKey, error: msg };
            }
          },
        },
        suggest_chart: {
          description:
            "Suggest a chart visualization to the user. Use after answering with text, when the data would benefit from a chart. The user can then choose to view it.",
          parameters: z.object({
            sql: z.string().describe("The SQLite query for the chart"),
            chartType: z.enum(["bar", "line", "pie"]).describe("Chart type"),
            xKey: z.string().describe("Column name for X axis"),
            yKey: z.string().describe("Column name for Y axis / values"),
            groupKey: z
              .string()
              .optional()
              .describe(
                "Column to group/split data by."
              ),
          }),
          execute: async ({ sql, chartType, xKey, yKey, groupKey }) => {
            try {
              return { sql, data: query(sql), chartType, xKey, yKey, groupKey };
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              return { sql, data: [], chartType, xKey, yKey, groupKey, error: msg };
            }
          },
        },
        ...(enableKnowledge
          ? {
              search_knowledge: {
                description:
                  "Search the knowledge base for company policies, product docs, FAQs, and general information. Use when the question is NOT about querying database numbers or statistics.",
                parameters: z.object({
                  query: z
                    .string()
                    .describe("The search query in natural language"),
                }),
                execute: async ({ query: q }) => {
                  try {
                    const results = await searchDocuments(q, 5, searchSpaceIds);
                    return { query: q, results };
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
