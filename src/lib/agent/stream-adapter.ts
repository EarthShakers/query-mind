/**
 * LangGraph Agent 输出 → useChat 可消费的流式响应
 *
 * 关键改动：使用 graph.stream() 实时推送节点进度，前端可展示真实的规划/执行/综合过程
 */
import { streamText, formatStreamPart } from "ai";
import { dashscopeProvider } from "@/lib/llm/llm";
import { MODEL_LIGHT } from "@/lib/llm/models";
import { buildAgentGraph } from "@/lib/agent/agent-graph";
import type { CoreMessage } from "ai";
import type { SubTask } from "@/lib/agent/state";

export interface AgentStreamInput {
  userMessage: string;
  conversationHistory: CoreMessage[];
  spaceIds: string[];
  tableSchemas: string;
  enableKnowledge: boolean;
  enableQuery: boolean;
}

/** 前端可消费的进度事件 */
export interface AgentProgressEvent {
  type: "agent_progress";
  node: string;
  ts: string;
  strategy?: string;
  subTasks?: { id: string; tool: string; description: string }[];
  toolSummary?: { id: string; kind: string; count: number; error?: string }[];
}

/**
 * 从 agent 的 toolResults + plan 生成 synthetic tool_call + tool_result 流片段
 */
function buildToolStreamParts(
  plan: { sub_tasks: SubTask[] } | null,
  toolResults: Record<string, unknown>
): string[] {
  const parts: string[] = [];
  if (!plan?.sub_tasks?.length) return parts;

  for (const task of plan.sub_tasks) {
    const result = toolResults[task.id];
    if (result == null) continue;

    const toolCallId = `agent-${task.id}`;
    const toolName = task.tool;

    const args =
      toolName === "search_knowledge"
        ? { query: (result as { query?: string }).query ?? task.query ?? "" }
        : toolName === "execute_query"
          ? { sql: (result as { sql?: string }).sql ?? (task as { sql?: string }).sql ?? "" }
          : {};

    parts.push(formatStreamPart("tool_call", { toolCallId, toolName, args }));
    parts.push(formatStreamPart("tool_result", { toolCallId, result }));
  }
  return parts;
}

/**
 * 运行 Agent 并返回 useChat 兼容的流式响应
 *
 * 1. graph.stream() 实时推送每个节点完成的进度事件（data stream part）
 * 2. 注入 tool_call + tool_result
 * 3. streamText 流式输出 finalAnswer
 */
export async function createAgentStreamResponse(input: AgentStreamInput) {
  const graph = buildAgentGraph();

  const initialState = {
    userMessage: input.userMessage,
    conversationHistory: input.conversationHistory,
    spaceIds: input.spaceIds,
    tableSchemas: input.tableSchemas,
    enableKnowledge: input.enableKnowledge,
    enableQuery: input.enableQuery,
  };

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // 异步执行 agent 管线，边执行边推送进度
  (async () => {
    try {
      let plan: { sub_tasks: SubTask[]; strategy?: string } | null = null;
      let toolResults: Record<string, unknown> = {};
      let finalAnswer = "";

      // ── Phase 1: 流式执行图，每个节点完成后推送进度 ──
      const stream = await graph.stream(initialState, {
        recursionLimit: 25,
        streamMode: "updates" as const,
      });
      for await (const event of stream) {
        const nodeName = Object.keys(event)[0];
        const nodeData = (event as Record<string, Record<string, unknown>>)[nodeName];
        if (!nodeData) continue;

        // 累积状态
        if (nodeData.plan) plan = nodeData.plan as { sub_tasks: SubTask[]; strategy?: string };
        if (nodeData.toolResults) {
          toolResults = { ...toolResults, ...(nodeData.toolResults as Record<string, unknown>) };
        }
        if (nodeData.finalAnswer) finalAnswer = nodeData.finalAnswer as string;

        // 构建进度事件
        const progress: Record<string, unknown> = {
          type: "agent_progress",
          node: nodeName,
          ts: new Date().toISOString(),
        };

        if (nodeName === "planning" && plan) {
          progress.strategy = plan.strategy;
          progress.subTasks = (plan.sub_tasks ?? []).map((t) => ({
            id: t.id,
            tool: t.tool,
            description: t.description,
          }));
        }

        if (nodeName === "execute") {
          progress.toolSummary = Object.entries(toolResults).map(([id, r]) => {
            const res = r as Record<string, unknown>;
            if (Array.isArray(res?.results)) {
              return { id, kind: "search", count: (res.results as unknown[]).length };
            }
            if (Array.isArray(res?.data)) {
              return {
                id,
                kind: "query",
                count: (res.data as unknown[]).length,
                error: res.error as string | undefined,
              };
            }
            return { id, kind: "other", count: 0 };
          });
        }

        // 推送到客户端
        await writer.write(
          encoder.encode(formatStreamPart("data", [JSON.parse(JSON.stringify(progress))]))
        );
      }

      finalAnswer = finalAnswer?.trim() || "抱歉，处理时遇到问题，请稍后重试。";

      // ── Phase 2: 注入 tool_call + tool_result ──
      const toolParts = buildToolStreamParts(plan, toolResults);
      for (const part of toolParts) {
        await writer.write(encoder.encode(part));
      }

      // ── Phase 3: 流式输出最终回答 ──
      const result = await streamText({
        model: dashscopeProvider(MODEL_LIGHT),
        system:
          "你是一个纯输出管道。用户会给你一段完整文本，你必须原样、逐字输出，禁止任何增删改。",
        prompt: `请原样输出以下内容，不要做任何修改：\n\n${finalAnswer}`,
        maxTokens: 4096,
      });

      const textResponse = result.toDataStreamResponse();
      const reader = textResponse.body!.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }

      await writer.close();
    } catch (err) {
      console.error("[agent-stream] Error:", err);
      try {
        await writer.write(
          encoder.encode(formatStreamPart("error", "Agent 执行出错，请重试"))
        );
        await writer.close();
      } catch {
        try { await writer.abort(err); } catch {}
      }
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Vercel-AI-Data-Stream": "v1",
    },
  });
}
