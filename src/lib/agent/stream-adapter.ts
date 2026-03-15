/**
 * LangGraph Agent 输出 → useChat 可消费的流式响应
 *
 * 关键改动：使用 graph.stream() 实时推送节点进度，前端可展示真实的规划/执行/综合过程
 */
import { streamText, formatStreamPart, generateObject } from "ai";
import { z } from "zod";
import { dashscopeProvider } from "@/lib/llm/llm";
import { getModelLight } from "@/lib/llm/model-config";
import { buildAgentGraph } from "@/lib/agent/agent-graph";
import type { CoreMessage } from "ai";
import type { SubTask } from "@/lib/agent/state";

/** 大模型判断检索 chunks 是否与用户问题相关 */
async function judgeChunksRelevance(
  userQuery: string,
  chunks: Array<{ content?: string; summary?: string; similarity?: number }>
): Promise<boolean> {
  if (!chunks?.length) return true;
  const summaries = chunks
    .slice(0, 5)
    .map((c, i) => `[${i + 1}] ${(c.summary ?? c.content ?? "").slice(0, 150)}...`)
    .join("\n");
  try {
    const { object } = await generateObject({
      model: dashscopeProvider(getModelLight()),
      schema: z.object({ relevant: z.boolean() }),
      prompt: `用户问题：${userQuery}\n\n检索到的片段：\n${summaries}\n\n这些片段与用户问题是否相关？回答 true 或 false。`,
      maxTokens: 16,
    });
    return object.relevant;
  } catch {
    return true; // 判断失败默认视为相关
  }
}

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
  /** execute 节点的完整 tool 结果，含 chunks，用于实时展示 */
  toolResults?: Array<{ toolName: string; result: unknown; chunksRelevant?: boolean }>;
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

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const streamWriter = async (event: unknown) => {
    const e = event as {
      type?: string;
      node?: string;
      ts?: string;
      toolComplete?: { taskId: string; toolName: string; result: unknown };
      validationCheck?: { name: string; score?: number; passed?: boolean; message?: string };
    };
    if (e?.validationCheck) {
      const vc = e.validationCheck;
      await writer.write(
        encoder.encode(
          formatStreamPart("data", [
            JSON.parse(
              JSON.stringify({
                type: "agent_progress",
                node: "validate",
                ts: e.ts ?? new Date().toISOString(),
                validationCheck: { name: vc.name, score: vc.score },
              })
            ),
          ])
        )
      );
      return;
    }
    if (!e?.toolComplete) return;
    const { taskId, toolName, result } = e.toolComplete;
    let chunksRelevant: boolean | undefined;
    if (
      toolName === "search_knowledge" &&
      Array.isArray((result as { results?: unknown[] }).results)
    ) {
      const chunks = (result as { results?: unknown[] }).results ?? [];
      chunksRelevant = await judgeChunksRelevance(
        input.userMessage,
        chunks as Array<{ content?: string; summary?: string; similarity?: number }>
      );
    }
    const progress = {
      type: "agent_progress",
      node: "execute",
      ts: e.ts ?? new Date().toISOString(),
      toolComplete: { taskId, toolName, result, chunksRelevant },
    };
    await writer.write(
      encoder.encode(formatStreamPart("data", [JSON.parse(JSON.stringify(progress))]))
    );
  };

  const initialState = {
    userMessage: input.userMessage,
    conversationHistory: input.conversationHistory,
    spaceIds: input.spaceIds,
    tableSchemas: input.tableSchemas,
    enableKnowledge: input.enableKnowledge,
    enableQuery: input.enableQuery,
    streamWriter,
  };

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

        if (nodeName === "planning" && plan) {
          // 逐条推送计划子任务，搜索到一条展示一个
          const tasks = plan.sub_tasks ?? [];
          if (plan.strategy) {
            await writer.write(
              encoder.encode(
                formatStreamPart("data", [
                  JSON.parse(
                    JSON.stringify({
                      type: "agent_progress",
                      node: "planning",
                      ts: new Date().toISOString(),
                      strategy: plan.strategy,
                    })
                  ),
                ])
              )
            );
          }
          for (const t of tasks) {
            await writer.write(
              encoder.encode(
                formatStreamPart("data", [
                  JSON.parse(
                    JSON.stringify({
                      type: "agent_progress",
                      node: "planning",
                      ts: new Date().toISOString(),
                      strategy: plan.strategy,
                      planTask: { id: t.id, tool: t.tool, description: t.description },
                    })
                  ),
                ])
              )
            );
          }
        } else if (nodeName === "execute") {
          // toolComplete 已由 streamWriter 逐条推送，此处只推送最小事件标记 execute 完成
          const progress: Record<string, unknown> = {
            type: "agent_progress",
            node: "execute",
            ts: new Date().toISOString(),
          };
          await writer.write(
            encoder.encode(formatStreamPart("data", [JSON.parse(JSON.stringify(progress))]))
          );

          // 注入 tool_call + tool_result
          if (plan?.sub_tasks?.length) {
            const toolParts = buildToolStreamParts(plan, toolResults);
            for (const part of toolParts) {
              await writer.write(encoder.encode(part));
            }
          }
        } else {
          // synthesize / validate 等
          const progress: Record<string, unknown> = {
            type: "agent_progress",
            node: nodeName,
            ts: new Date().toISOString(),
          };
          await writer.write(
            encoder.encode(formatStreamPart("data", [JSON.parse(JSON.stringify(progress))]))
          );
        }
      }

      finalAnswer = finalAnswer?.trim() || "抱歉，处理时遇到问题，请稍后重试。";

      // Phase 2 已移至 execute 节点完成时实时推送，此处不再重复注入

      // ── Phase 3: 流式输出最终回答 ──
      const result = await streamText({
        model: dashscopeProvider(getModelLight()),
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
