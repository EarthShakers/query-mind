/**
 * LangGraph Agent 输出 → useChat 可消费的流式响应
 * 方案：运行 agent 后，注入 tool_call/tool_result 使客户端展示 Execution Stream，再用 streamText 流式输出 finalAnswer
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

export interface AgentStepEvent {
  step: string;
  data?: Record<string, unknown>;
}

/**
 * 从 agent 的 toolResults + plan 生成 synthetic tool_call + tool_result 流片段
 * 与 streamText 的 tool 格式一致，useChat 解析后会有 toolInvocations
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
 * 1. 运行 LangGraph 到完成
 * 2. 注入 tool_call + tool_result（与 streamText 一致），客户端可展示 chunks
 * 3. 用 streamText 将 finalAnswer 流式输出
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

  const finalState = await graph.invoke(initialState, {
    recursionLimit: 25,
  });
  const finalAnswer =
    (finalState.finalAnswer as string)?.trim() ||
    "抱歉，处理时遇到问题，请稍后重试。";

  const toolParts = buildToolStreamParts(
    finalState.plan as { sub_tasks: SubTask[] } | null,
    (finalState.toolResults as Record<string, unknown>) ?? {}
  );

  const result = await streamText({
    model: dashscopeProvider(MODEL_LIGHT),
    system:
      "你是一个纯输出管道。用户会给你一段完整文本，你必须原样、逐字输出，禁止任何增删改。",
    prompt: `请原样输出以下内容，不要做任何修改：\n\n${finalAnswer}`,
    maxTokens: 4096,
  });

  const textStream = result.toDataStreamResponse();
  const textBody = textStream.body!;

  const encoder = new TextEncoder();
  const prependStream = new ReadableStream({
    start(controller) {
      for (const part of toolParts) {
        controller.enqueue(encoder.encode(part));
      }
      controller.close();
    },
  });

  const combinedStream = new ReadableStream({
    async start(controller) {
      const reader1 = prependStream.getReader();
      for (;;) {
        const { done, value } = await reader1.read();
        if (done) break;
        controller.enqueue(value);
      }
      const reader2 = textBody.getReader();
      for (;;) {
        const { done, value } = await reader2.read();
        if (done) break;
        controller.enqueue(value);
      }
      controller.close();
    },
  });

  return new Response(combinedStream, {
    headers: textStream.headers,
    status: textStream.status,
  });
}
