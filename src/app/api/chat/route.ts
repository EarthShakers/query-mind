import { streamText, type CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { query } from "@/lib/db";
import { buildSystemPrompt } from "@/lib/prompt";
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

  const { messages } = await req.json();

  const lastMsg = messages[messages.length - 1]?.content ?? "";
  const inputBlocked = checkInputLength(lastMsg);
  if (inputBlocked) return inputBlocked;

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
            "MUST use this tool when user asks about trends, comparisons, rankings, distributions, proportions, or any visualization.",
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
