import { streamText, type CoreMessage } from "ai";
import { z } from "zod";
import { getSpaceContext } from "@/lib/auth/auth";
import { dashscopeProvider } from "@/lib/llm/llm";
import {
  getModelConfig,
  runWithConfigAsync,
  getModelGame,
} from "@/lib/llm/model-config";
import {
  checkRateLimit,
  checkDailyBudget,
  recordTokenUsage,
} from "@/lib/rate-limit/ratelimit";
import { getGameSystemPrompt } from "@/lib/game/prompts";

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
  const blocked = (await checkRateLimit(req)) ?? (await checkDailyBudget());
  if (blocked) return blocked;

  const { messages, context } = await req.json();

  // game API 允许未登录用户使用 (CLI 本地开发场景)
  // 生产环境可通过限流控制

  const config = await getModelConfig();

  return runWithConfigAsync(config, async () => {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 300_000);

    try {
      const result = await streamText({
        model: dashscopeProvider(getModelGame()),
        abortSignal: abortController.signal,
        // 游戏生成现在只保留 read_file 工具；写文件通过普通文本流输出 FILE: 代码块。
        maxSteps: 6,
        system: getGameSystemPrompt(context),
        messages: sanitizeMessages(messages),
        tools: {
          read_file: {
            description: "读取用户本地项目中的文件",
            parameters: z.object({
              path: z.string().describe("相对路径"),
            }),
          },
        },
      });

      clearTimeout(timeout);
      return result.toDataStreamResponse();
    } catch (err) {
      clearTimeout(timeout);
      console.error("[game] error:", err);
      return new Response(
        JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  });
}
