当前 QueryMind 的对话流基于 Vercel AI SDK streamText + maxSteps，LLM  
 可以多步调用工具，但缺少：

- 显式的规划/推理步骤（LLM 直接跳到工具调用）
- 跨工具编排（无法 "先查 SQL 再用结果检索知识库"）
- 自我验证（无 reflection/validation 环节）
- 记忆系统（每轮独立，无上下文积累）

已有基建：LangGraph 已集成（edit-section-graph.ts 是成熟的 6 节点图），RAG-Enhanced
有置信度路由，maxSteps 支持多步工具调用。

---

Phase 1: ReAct 增强（基于现有 streamText）

最小改动、最快见效。在现有工具循环上加显式推理。

1.1 新增 think 工具

文件: src/app/api/chat/route.ts（在 tools 对象中新增）

think: {
description:
"对复杂问题先思考再行动。涉及多步骤、多工具时必须先调用此工具规划。",
parameters: z.object({
reasoning: z.string().describe("逐步推理：需要什么信息、用什么工具、什么顺序"),
planned_tools: z.array(z.string()).describe("计划调用的工具列表"),
complexity: z.enum(["simple", "multi_step", "cross_tool"]),
}),
execute: async ({ reasoning, planned_tools, complexity }) => {
return { reasoning, planned_tools, complexity, status: "plan_ready" };
},
},

零副作用工具，仅让 LLM 的推理过程外显，用户可在"思考详情"面板看到。

1.2 新增 validate_answer 工具

文件: src/app/api/chat/route.ts

validate_answer: {
description: "收集完信息后，检查回答是否完整覆盖了用户问题的各个方面。",
parameters: z.object({
question_parts: z.array(z.string()).describe("用户问题拆解"),
answers_found: z.array(z.object({
part: z.string(),
answered: z.boolean(),
source: z.string(),
})),
missing: z.array(z.string()).describe("未解答部分"),
}),
execute: async ({ question_parts, answers_found, missing }) => {
return { question_parts, answers_found, missing, complete: missing.length === 0
};
},
},

1.3 System Prompt 增加 ReAct 引导

文件: src/lib/prompt.ts（在 <Task> 和 <ToolSelection> 之间插入）

 <ReActReasoning>
 对于复杂问题（多步骤或多工具），遵循 Think → Act → Observe 循环：

1.  Think：调用 think 工具，分析需要哪些信息、哪些工具、什么顺序
2.  Act：按计划依次调用工具
3.  Observe：检查结果，必要时调整计划

触发标准：

- 问题含"并且"、"同时"、"然后"等连接词
- 需要知识库 + 数据表联合回答
- 需先查数据，再用数据结果检索知识
- 模糊指令需拆解为子问题

示例：

- "分析退货规定，结合退货数据统计" → think → search_knowledge → execute_query →
  validate_answer
- "找销售最好的产品的产品说明" → think → execute_query → search_knowledge →
  validate_answer

简单单工具问题直接执行，不需要调用 think。
</ReActReasoning>

1.4 调整 maxSteps

文件: src/app/api/chat/route.ts:125

maxSteps: isReportMode ? 12 : 8, // 原 10 : 5，为 think + validate 留空间

1.5 前端展示

文件: src/components/chat/constants.ts — 新增 tool label：
think: "规划思路",
validate_answer: "验证回答",

文件: src/components/chat/thinking-details.tsx — 新增 think/validate 渲染：

- think 结果：显示推理过程 + 计划工具列表（带步骤编号的标签）
- validate_answer 结果：显示 ✅ 验证通过 或 ⚠️ 部分未解答

  1.6 验证方法

测试用例：

- 跨工具："分析知识库中的退货规定，结合退货数据做统计" → 应触发 think →
  search_knowledge → execute_query
- 序列依赖："找销量最高的产品，查知识库找该产品说明" → think → execute_query →
  search_knowledge
- 简单问题："公司报销流程" → 直接 search_knowledge，不调用 think

---

Phase 2: LangGraph 通用 Agent

对复杂查询用 LangGraph 状态机编排，简单查询保留 streamText。

2.1 复杂度路由器

新建文件: src/lib/agent/classify.ts

用 MODEL_LIGHT (qwen-turbo) 快速分类：simple / complex。

// 输入：用户消息 + 是否有知识库 + 是否有数据表
// 输出：{ complexity: "simple" | "complex", sub_tasks?: string[] }
// 失败默认 simple（不阻塞用户）

2.2 Agent 状态定义

新建文件: src/lib/agent/state.ts

const AgentState = Annotation.Root({
// 输入
userMessage: Annotation<string>,
conversationHistory: Annotation<CoreMessage[]>,
spaceIds: Annotation<string[]>,
tableSchemas: Annotation<string>,
enableKnowledge: Annotation<boolean>,
// 规划
plan: Annotation<{ sub_tasks: SubTask[], strategy: string } | null>,
// 工具结果累积器
toolResults: Annotation<Record<string, unknown>>({ reducer: merge }),
// 流程控制
currentStep: Annotation<string>,
finalAnswer: Annotation<string>,
errors: Annotation<string[]>,
retries: Annotation<number>,
});

2.3 Agent 图结构

新建文件: src/lib/agent/agent-graph.ts

START → plan → execute (loop) → synthesize → validate → END
↑ |
└──────── retry (max 2) ───────┘

┌────────────┬────────────────────────────────────────────────┬────────────┐
│ 节点 │ 职责 │ 模型 │
├────────────┼────────────────────────────────────────────────┼────────────┤
│ plan │ 拆解问题为 sub_tasks，每个指定工具和依赖 │ MODEL_CHAT │
├────────────┼────────────────────────────────────────────────┼────────────┤
│ execute │ 按依赖序执行 sub_tasks，后续任务可引用前序结果 │ 工具调用 │
├────────────┼────────────────────────────────────────────────┼────────────┤
│ synthesize │ 合并所有工具结果，生成最终回答 │ MODEL_CHAT │
├────────────┼────────────────────────────────────────────────┼────────────┤
│ validate │ 检查回答是否覆盖所有 sub_tasks │ 规则检查 │
└────────────┴────────────────────────────────────────────────┴────────────┘

关键：execute 节点支持跨工具数据传递 —— 如 SQL 查出"产品 A"后，自动将其注入后续 RAG
查询。

2.4 工具函数复用

新建文件: src/lib/agent/tools.ts

包装现有函数，供 agent graph 调用：

- agentSearchKnowledge(query, spaceIds) → 复用 searchWithRagEnhanced()
- agentExecuteQuery(description, tableSchemas) → LLM 生 SQL + queryUserData()
- agentShowChart(...) → 复用现有图表逻辑

  2.5 流式输出适配

新建文件: src/lib/agent/stream-adapter.ts

将 LangGraph 的 graph.stream({ streamMode: "updates" }) 转换为 Vercel AI SDK
useChat 能消费的 SSE 格式。

两个方案（按优先级尝试）：

1.  优先: 用 createDataStreamResponse 从 ai 包，把 agent 步骤作为 data annotations
    发送
2.  备选: 自定义 SSE（参考 edit-section/route.ts 的 SSE 模式），前端用专门 hook 处理

2.6 路由集成

文件: src/app/api/chat/route.ts

// 在 streamText 调用前，判断复杂度
const { complexity } = await classifyComplexity(lastMsg);

if (complexity === "complex") {
// LangGraph agent path
return createAgentStreamResponse(graph, input);
}

// 原有 streamText path（不改动）
const result = await streamText({ ... });
return result.toDataStreamResponse();

2.7 前端 Agent 进度展示

文件: src/components/chat/assistant-turn.tsx

新增 AgentProgress 组件，渲染 checklist 样式的步骤进度：
⏳ 智能分析中...
✅ 分析问题 → 识别到 2 个子任务
✅ 搜索知识库 → 找到 5 条相关文档
🔄 查询数据表 → 执行 SQL...
○ 综合分析
○ 验证回答

2.8 文件结构

src/lib/agent/
classify.ts — 复杂度分类
state.ts — LangGraph 状态定义
agent-graph.ts — 图构建（节点 + 边 + 条件路由）
prompts.ts — plan / synthesize / sql-gen 提示词
tools.ts — 包装现有工具供 agent 使用
stream-adapter.ts — LangGraph → Vercel AI SDK 流式适配

2.9 验证方法

新增评估数据集 eval/agent-eval.json：
[
{ "question": "退货规定+退货数据统计", "expected_tools":
["search_knowledge","execute_query"], "complexity": "complex" },
{ "question": "销量最高产品的产品说明", "expected_tools":
["execute_query","search_knowledge"], "complexity": "complex" },
{ "question": "公司报销流程", "expected_tools": ["search_knowledge"],
"complexity": "simple" }
]

---

Phase 3: 记忆系统

3.1 Session 工作记忆

新建文件: src/lib/agent/memory.ts

class SessionMemory {
private facts: Map<string, { value: string; source: string; turn: number }>;

addFact(key, value, source, turn) // 去重，保留最新
getFacts(): string // 格式化为 prompt 上下文
toPromptContext(): string // 包装为 <WorkingMemory> 块
}

集成点：在 buildSystemPrompt() 末尾追加 memory.toPromptContext()。

事实提取：工具结果返回后，用简单规则或 LLM 提取关键事实（如 "销量最高的产品是
X"）。

3.2 跨 Session 偏好

Supabase 新表: user_preferences
CREATE TABLE user_preferences (
id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
user_id UUID NOT NULL,
preference_key TEXT NOT NULL,
preference_value TEXT NOT NULL,
updated_at TIMESTAMPTZ DEFAULT NOW(),
UNIQUE(user_id, preference_key)
);

新建文件: src/lib/agent/preferences.ts

偏好类型：preferred_chart_type、detail_level、language_style 等。

3.3 remember 工具

在 tools 中新增，允许 agent 主动存储用户偏好。

3.4 验证方法

- 工作记忆：Turn1 查出"产品 A 销量最高"，Turn2 问"这个产品退货情况" → agent
  自动关联"产品 A"
- 跨 Session：Session1 用户说"以后用柱状图"，Session2 数据查询后默认推荐 bar chart

---

实施顺序

┌─────────┬───────────────────────────────────────────────────┬─────────┐
│ 阶段 │ 改动范围 │ 依赖 │
├─────────┼───────────────────────────────────────────────────┼─────────┤
│ Phase 1 │ 2 个文件修改（route.ts, prompt.ts）+ 2 个前端小改 │ 无 │
├─────────┼───────────────────────────────────────────────────┼─────────┤
│ Phase 2 │ 6 个新文件 + route.ts 路由分叉 + 前端进度组件 │ Phase 1 │
├─────────┼───────────────────────────────────────────────────┼─────────┤
│ Phase 3 │ 2 个新文件 + 1 张新表 + prompt.ts 集成 │ Phase 2 │
└─────────┴───────────────────────────────────────────────────┴─────────┘

关键风险

1.  流式适配（Phase 2 最难点）：LangGraph 输出 → useChat
    消费的格式转换。备选方案：自定义 SSE + 专用 hook
2.  复杂度分类误判：默认 simple，不阻塞用户。渐进优化分类器
3.  延迟增加：分类器 ~200ms，规划 ~500ms。用 MODEL_LIGHT 降低延迟
4.  Token 成本：agent graph 多次 LLM 调用。plan/validate 用轻量模型，synthesize
    用主模型
