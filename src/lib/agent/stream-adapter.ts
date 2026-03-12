/**
 * LangGraph Agent 输出 → useChat 可消费的流式响应
 * 方案：运行 agent 后，用 streamText 将 finalAnswer 流式输出，保持与 useChat 兼容
 */
import { streamText } from "ai";
import { dashscopeProvider } from "@/lib/llm/llm";
import { MODEL_LIGHT } from "@/lib/llm/models";
import { buildAgentGraph } from "@/lib/agent/agent-graph";
import type { CoreMessage } from "ai";

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
 * 运行 Agent 并返回 useChat 兼容的流式响应
 * 1. 运行 LangGraph 到完成
 * 2. 用 streamText 将 finalAnswer 流式输出（轻量模型快速 echo，保持格式兼容）
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

  // 用 streamText 流式输出最终答案，保持 useChat 兼容
  // 使用轻量模型 + 强约束 prompt，使模型逐字复述
  const result = await streamText({
    model: dashscopeProvider(MODEL_LIGHT),
    system:
      "你是一个纯输出管道。用户会给你一段完整文本，你必须原样、逐字输出，禁止任何增删改。",
    prompt: `请原样输出以下内容，不要做任何修改：\n\n${finalAnswer}`,
    maxTokens: 4096,
  });

  return result.toDataStreamResponse();
}
