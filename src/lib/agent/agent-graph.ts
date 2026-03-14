/**
 * LangGraph Agent 图：plan → execute → synthesize → validate → END
 *
 * 流程：规划子任务 → 按依赖执行工具 → 综合生成回答 → 验证
 */
import { StateGraph, END } from "@langchain/langgraph";
import { getDashScopeLLM } from "@/lib/llm/llm";
import { MODEL_CHAT } from "@/lib/llm/models";
import {
  AgentState,
  type AgentStateType,
  type SubTask,
} from "@/lib/agent/state";
import { planPrompt, synthesizePrompt } from "@/lib/agent/prompts";
import {
  agentSearchKnowledge,
  agentExecuteQuery,
} from "@/lib/agent/tools";
import {
  getRouteHint,
  applyRouteRules,
  reorderByPreferSearchFirst,
} from "@/lib/agent/router";

/**
 * 规划节点：先按 prompt 规则路由，再（必要时）用 LLM 拆解子任务
 *
 * 规则（显式编排，不依赖 LLM 判断）：
 * - Schema 无销量/产品相关表 → 强制 search_knowledge
 * - 销量+说明类问题 → search_knowledge 优先
 * - execute_query 失败 → 在 execute 节点 fallback 到 search_knowledge
 */
async function planNode(state: AgentStateType) {
  const tableSchemas = state.tableSchemas || "无";
  const routeHint = getRouteHint(
    state.userMessage,
    tableSchemas,
    !!state.enableKnowledge,
    !!state.enableQuery
  );

  const llm = getDashScopeLLM({
    model: MODEL_CHAT,
    temperature: 0.2,
    maxTokens: 2048,
  });

  const response = await planPrompt.pipe(llm).invoke({
    userMessage: state.userMessage,
    tableSchemas,
    enableKnowledge: state.enableKnowledge ? "是" : "否",
    enableQuery: state.enableQuery ? "是" : "否",
  });
  const text = typeof response.content === "string" ? response.content : "";

  try {
    const parsed = JSON.parse(
      text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    );
    let sub_tasks = (parsed.sub_tasks ?? []).map((t: SubTask) => ({
      id: t.id || `st${Math.random().toString(36).slice(2, 8)}`,
      tool: ["search_knowledge", "execute_query"].includes(t.tool)
        ? t.tool
        : "search_knowledge",
      description: t.description || "",
      query: t.query,
      sql: t.sql,
      depends_on: Array.isArray(t.depends_on) ? t.depends_on : [],
    }));

    sub_tasks = applyRouteRules(sub_tasks, routeHint, state.userMessage);
    if (routeHint.preferSearchFirst) {
      sub_tasks = reorderByPreferSearchFirst(sub_tasks, state.userMessage);
    }

    return {
      plan: {
        strategy: parsed.strategy || "",
        sub_tasks,
      },
      currentStep: "planning",
      completedSteps: ["planning"],
    };
  } catch {
    return {
      plan: null,
      currentStep: "planning",
      errors: ["规划解析失败"],
    };
  }
}

/**
 * 从前序工具结果中提取可注入到后续 query 的文本
 *
 * 支持格式：数组（取首行前 3 列）、{ data: [...] }（取首行前 3 列）
 * 例：execute_query 返回 [{ product: "A", sales: 100 }] → "A 100"
 */
function extractInjectContext(prevResults: unknown): string {
  const val = prevResults as Record<string, unknown> | unknown[] | null;
  if (!val || typeof val !== "object") return "";
  if (Array.isArray(val) && val.length > 0) {
    const first = val[0] as Record<string, unknown>;
    if (first && typeof first === "object") {
      const vals = Object.values(first).filter(
        (v) => typeof v === "string" || typeof v === "number"
      );
      return vals.slice(0, 3).join(" ");
    }
  }
  if ("data" in val && Array.isArray((val as { data: unknown[] }).data)) {
    const data = (val as { data: Record<string, unknown>[] }).data;
    if (data.length > 0 && data[0]) {
      return Object.values(data[0]).slice(0, 3).join(" ");
    }
  }
  return "";
}

/**
 * 执行节点：按 plan.sub_tasks 顺序执行工具，支持 depends_on 注入
 *
 * 1. 遍历子任务，若有 depends_on 则从 toolResults 取前序结果
 * 2. 用 extractInjectContext 提取文本，拼接到当前 query
 * 3. 调用 search_knowledge 或 execute_query，结果写入 toolResults[task.id]
 */
async function executeNode(state: AgentStateType) {
  const plan = state.plan;
  if (!plan || !plan.sub_tasks.length) {
    // 无子任务（通用问题直接回答），跳过执行
    return {
      toolResults: {},
      completedSteps: [...(state.completedSteps || []), "execute"],
      currentStep: "execute",
    };
  }

  const toolResults = { ...state.toolResults };
  const completedSteps = [...(state.completedSteps || [])];

  for (const task of plan.sub_tasks) {
    const deps = task.depends_on || [];
    let injectContext = "";
    for (const depId of deps) {
      const prev = toolResults[depId];
      if (prev) injectContext += " " + extractInjectContext(prev);
    }
    injectContext = injectContext.trim();

    if (task.tool === "search_knowledge") {
      const query = (task.query || state.userMessage).trim();
      const finalQuery = injectContext ? `${injectContext} ${query}` : query;
      const result = await agentSearchKnowledge(
        finalQuery,
        state.spaceIds,
        state.userMessage
      );
      toolResults[task.id] = result;
      completedSteps.push(`search_knowledge:${task.id}`);
      await state.streamWriter?.({
        type: "agent_progress",
        node: "execute",
        ts: new Date().toISOString(),
        toolComplete: { taskId: task.id, toolName: task.tool, result },
      });
    } else if (task.tool === "execute_query") {
      if (!task.sql) {
        // LLM 未输出 sql，fallback 到 search_knowledge
        const fallback = await agentSearchKnowledge(
          state.userMessage,
          state.spaceIds,
          state.userMessage
        );
        toolResults[task.id] = { ...fallback, _fallback: true, _reason: "no_sql" };
        completedSteps.push(`search_knowledge:${task.id}(fallback)`);
        await state.streamWriter?.({
          type: "agent_progress",
          node: "execute",
          ts: new Date().toISOString(),
          toolComplete: { taskId: task.id, toolName: "search_knowledge", result: fallback },
        });
      } else {
        const result = await agentExecuteQuery(task.sql);
        if (
          result.error &&
          state.enableKnowledge &&
          state.spaceIds.length > 0
        ) {
          const fallback = await agentSearchKnowledge(
            state.userMessage,
            state.spaceIds,
            state.userMessage
          );
          toolResults[task.id] = {
            ...fallback,
            _fallback: true,
            _originalError: result.error,
          };
          completedSteps.push(`search_knowledge:${task.id}(fallback)`);
          await state.streamWriter?.({
            type: "agent_progress",
            node: "execute",
            ts: new Date().toISOString(),
            toolComplete: { taskId: task.id, toolName: "search_knowledge", result: fallback },
          });
        } else {
          toolResults[task.id] = result;
          completedSteps.push(`execute_query:${task.id}`);
          await state.streamWriter?.({
            type: "agent_progress",
            node: "execute",
            ts: new Date().toISOString(),
            toolComplete: { taskId: task.id, toolName: "execute_query", result },
          });
        }
      }
    }
  }

  return {
    toolResults,
    completedSteps,
    currentStep: "execute",
  };
}

/**
 * 综合节点：用 LLM 合并所有工具结果，生成最终回答
 *
 * 输入：state.toolResults（各子任务结果）
 * 输出：finalAnswer（简洁、基于真实数据的回答）
 */
async function synthesizeNode(state: AgentStateType) {
  const llm = getDashScopeLLM({
    model: MODEL_CHAT,
    temperature: 0.3,
    maxTokens: 2048,
  });

  const response = await synthesizePrompt.pipe(llm).invoke({
    userMessage: state.userMessage,
    toolResults: JSON.stringify(state.toolResults, null, 2),
  });
  const text = typeof response.content === "string" ? response.content : "";

  return {
    finalAnswer: text.trim(),
    currentStep: "synthesize",
    completedSteps: [...(state.completedSteps || []), "synthesize"],
  };
}

/**
 * 验证节点：规则检查（当前为占位，可扩展为 retry 逻辑）
 *
 * 可检查：是否有 plan、finalAnswer 是否足够长、是否覆盖所有子任务等
 */
function validateNode(state: AgentStateType) {
  return {
    currentStep: "validate",
    completedSteps: [...(state.completedSteps || []), "validate"],
  };
}

/**
 * 构建并编译 Agent 图
 *
 * 节点：plan → execute → synthesize → validate
 * 条件边：plan 后若无子任务（通用问题）直接跳到 synthesize
 */
export function buildAgentGraph() {
  const graph = new StateGraph(AgentState)
    .addNode("planning", planNode)
    .addNode("execute", executeNode)
    .addNode("synthesize", synthesizeNode)
    .addNode("validate", validateNode)
    .addEdge("__start__", "planning")
    .addConditionalEdges("planning", (state: AgentStateType) => {
      const hasTasks = state.plan?.sub_tasks?.length ?? 0;
      return hasTasks > 0 ? "execute" : "synthesize";
    })
    .addEdge("execute", "synthesize")
    .addEdge("synthesize", "validate")
    .addEdge("validate", END);

  return graph.compile();
}
