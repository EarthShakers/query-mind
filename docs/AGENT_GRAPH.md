# Agent 图结构说明

本文档帮助理解 `src/lib/agent/agent-graph.ts` 中的 LangGraph 结构。

## 流程图

```mermaid
flowchart LR
    subgraph Agent["LangGraph Agent"]
        START(("__start__"))
        planning["planning<br/>规划子任务"]
        execute["execute<br/>执行工具"]
        synthesize["synthesize<br/>综合回答"]
        validate["validate<br/>验证"]
        END_NODE(("__end__"))
    end

    START --> planning
    planning -- "有子任务" --> execute
    planning -- "通用问题<br/>空 sub_tasks" --> synthesize
    execute --> synthesize
    synthesize --> validate
    validate --> END_NODE

    style planning fill:#e3f2fd
    style execute fill:#fff3e0
    style synthesize fill:#f3e5f5
    style validate fill:#e8eaf6
    style START fill:#e8f5e9
    style END_NODE fill:#ffebee
```

## 核心概念

### 1. StateGraph（状态图）

LangGraph 用 **StateGraph** 定义「状态机」：每个节点接收当前状态，返回状态更新，图按边顺序执行。

```ts
const graph = new StateGraph(AgentState)
  .addNode("planning", planNode)
  .addNode("execute", executeNode)
  .addNode("synthesize", synthesizeNode)
  .addNode("validate", validateNode)
  .addEdge("__start__", "planning")
  .addConditionalEdges("planning", (state) => {
    // 通用问题无子任务 → 跳过 execute 直接综合回答
    return (state.plan?.sub_tasks?.length ?? 0) > 0 ? "execute" : "synthesize";
  })
  .addEdge("execute", "synthesize")
  .addEdge("synthesize", "validate")
  .addEdge("validate", END);

return graph.compile();
```

### 2. 状态（State）

在 `state.ts` 中定义，所有节点共享同一份状态，通过返回值**合并更新**：

| 字段             | 说明                               |
| ---------------- | ---------------------------------- |
| `userMessage`    | 用户问题                           |
| `plan`           | 规划结果（子任务列表）             |
| `toolResults`    | 各工具执行结果，key 为 sub_task.id |
| `finalAnswer`    | 最终回答                           |
| `completedSteps` | 已完成的步骤                       |

### 3. 各节点职责

| 节点           | 输入                                             | 输出             | 说明                                                                                                                                  |
| -------------- | ------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **planning**   | userMessage, tableSchemas, enableKnowledge/Query | plan (sub_tasks) | 先按 router 规则路由；forceSearchOnly 时跳过 LLM 直接生成单任务；通用常识问题返回空 sub_tasks；否则 LLM 拆解，再 applyRouteRules 修正 |
| **execute**    | plan, toolResults                                | toolResults      | 按依赖顺序执行子任务；空 sub_tasks 时跳过（由条件边直接到 synthesize）；execute_query 失败或无 sql 时 fallback 到 search_knowledge    |
| **synthesize** | toolResults                                      | finalAnswer      | 有工具结果时基于数据回答；无工具结果（通用问题）时用 LLM 自身知识直接回答                                                             |
| **validate**   | finalAnswer, plan                                | -                | 规则检查（当前为占位，可扩展）                                                                                                        |

### 4. 路由规则（router.ts）

基于 prompt 规则显式编排，不依赖 LLM 判断：

| 规则                      | 实现                                              |
| ------------------------- | ------------------------------------------------- |
| Schema 无销量/产品相关表  | forceSearchOnly → 直接 search_knowledge，跳过 LLM |
| 销量+说明类问题           | preferSearchFirst → 子任务顺序 search 优先        |
| execute_query 失败/无 sql | execute 节点内 fallback 到 search_knowledge       |

### 5. 跨工具数据传递

当子任务有 `depends_on: ["st1"]` 时，execute 会：

1. 从 `toolResults["st1"]` 取前序结果
2. 用 `extractInjectContext()` 提取关键文本（如 "产品 A"）
3. 拼接到当前 query：`"产品A 产品说明"`

例如：「销量最高的产品及其说明」→ st1 查 SQL 得产品 A → st2 用 "产品 A 说明" 搜知识库。

## 触发方式

用户在输入框旁手动开启「Agent 模式」按钮 → `agentMode=true` 随请求发送 → `route.ts` 走 `createAgentStreamResponse`。默认关闭时走 streamText。Report 模式下忽略 Agent 模式开关。

## 与 streamText 的区别

| 对比项     | streamText（默认）         | LangGraph Agent（Agent 模式）                       |
| ---------- | -------------------------- | --------------------------------------------------- |
| 触发方式   | 默认                       | 用户手动开启「Agent 模式」按钮                     |
| 编排方式   | LLM 自主决定调用顺序       | 显式 plan → execute 流程，支持条件跳转              |
| 通用问题   | LLM 直接回答               | planning 判断后跳过 execute，LLM 直接回答           |
| 跨工具传参 | 依赖 LLM 理解上下文        | 通过 depends_on + inject 显式传递                   |
| 前端展示   | 思考动画 + ThinkingDetails | AgentProgress（Reasoning Graph + Execution Stream） |

## 相关文件

| 文件                | 说明                                                         |
| ------------------- | ------------------------------------------------------------ |
| `agent-graph.ts`    | 图构建与节点实现                                             |
| `router.ts`         | 数据来源路由（Schema 判断、工具选择）                        |
| `state.ts`          | 状态定义                                                     |
| `prompts.ts`        | plan / synthesize 提示词                                     |
| `tools.ts`          | agentSearchKnowledge、agentExecuteQuery                      |
| `stream-adapter.ts` | Agent 输出 → useChat 流式响应（注入 agent- 前缀 toolCallId） |
| `classify.ts`       | 复杂度分类器（已停用，保留备用）                             |
