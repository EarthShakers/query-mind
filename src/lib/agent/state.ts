/**
 * LangGraph Agent 状态定义
 */
import { Annotation } from "@langchain/langgraph";
import type { CoreMessage } from "ai";

export interface SubTask {
  id: string;
  tool: "search_knowledge" | "execute_query";
  description: string;
  query?: string;
  sql?: string;
  depends_on?: string[];
}

export interface PlanStep {
  sub_tasks: SubTask[];
  strategy: string;
}

function merge<T extends Record<string, unknown>>(
  a: T,
  b: Partial<T>
): T {
  return { ...a, ...b };
}

export const AgentState = Annotation.Root({
  // 输入
  userMessage: Annotation<string>(),
  conversationHistory: Annotation<CoreMessage[]>(),
  spaceIds: Annotation<string[]>(),
  tableSchemas: Annotation<string>(),
  enableKnowledge: Annotation<boolean>,
  enableQuery: Annotation<boolean>,

  // 规划
  plan: Annotation<PlanStep | null>({ reducer: (_, v) => v, default: () => null }),

  // 工具结果累积
  toolResults: Annotation<Record<string, unknown>>({
    reducer: (a, b) => merge(a ?? {}, b ?? {}),
    default: () => ({}),
  }),

  // 流程控制
  currentStep: Annotation<string>({ reducer: (_, v) => v, default: () => "" }),
  completedSteps: Annotation<string[]>({
    reducer: (_, v) => v ?? [],
    default: () => [],
  }),
  finalAnswer: Annotation<string>({ reducer: (_, v) => v, default: () => "" }),
  /** 验证失败时的重试提示，传给 synthesize */
  validationFeedback: Annotation<string>({ reducer: (_, v) => v, default: () => "" }),
  /** 验证是否全部通过，用于条件边 */
  validationPassed: Annotation<boolean>({ reducer: (_, v) => v, default: () => true }),
  errors: Annotation<string[]>({
    reducer: (a, b) => [...(a ?? []), ...(b ?? [])],
    default: () => [],
  }),
  retries: Annotation<number>({ reducer: (_, v) => v, default: () => 0 }),

  /** 流式推送回调，execute 节点每完成一个工具即调用 */
  streamWriter: Annotation<((event: unknown) => Promise<void>) | undefined>({
    reducer: (_, v) => v,
    default: () => undefined,
  }),
});

export type AgentStateType = typeof AgentState.State;
