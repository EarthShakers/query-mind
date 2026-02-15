# AI SQL Generator - 技术核心原理

## 架构总览

```
用户输入 → useChat (流式) → API Route → streamText + Zod Tools → AI 选择工具
                                              ↓
                                    execute_query / show_chart
                                              ↓
                                    SQLite 执行 → 结果回传
                                              ↓
                              客户端根据 toolName 渲染 Table / Chart
```

---

## 三个核心技术点

### 1. Streaming（流式传输）

**问题**：大模型生成慢，用户等待体验差。

**解决**：Vercel AI SDK 的 `streamText` 将模型输出拆成 token 级别的流，通过 `ReadableStream` 逐块推送到前端。

```
服务端                           客户端
streamText() → ReadableStream → useChat() → 逐字渲染
```

关键代码：
- `src/app/api/chat/route.ts` — `streamText()` 生成流，`toDataStreamResponse()` 转为标准 HTTP 流响应
- `src/app/page.tsx` — `useChat()` hook 自动消费流，实时更新 `messages` 状态

### 2. Generative UI（生成式 UI）

**问题**：传统 chatbot 只能回复文字，无法展示结构化内容。

**解决**：AI 通过 tool calling 决定调用哪个工具，客户端根据 `toolName` 渲染对应的 React 组件。

```
AI 判断意图 → 调用 execute_query → 客户端渲染 <SqlResult> 表格
           → 调用 show_chart    → 客户端渲染 <ChartResult> 图表
```

**AI 决定 UI，而非前端硬编码。** 同一句"各部门薪资"，AI 可能选表格也可能选柱状图——这就是 Generative UI 的核心思想。

关键实现：
- 服务端定义 tools 的 `execute` 函数，返回序列化数据
- 客户端通过 `message.toolInvocations` 判断工具名，映射到对应组件

### 3. JSON Mode & Zod 结构化输出

**问题**：大模型输出不可控，可能返回格式错误的 JSON。

**解决**：用 Zod schema 定义 tool 的 parameters，AI SDK 强制模型输出符合 schema 的 JSON，解析失败则报错。

```ts
parameters: z.object({
  sql: z.string(),
  chartType: z.enum(["bar", "line", "pie"]),
  xKey: z.string(),
  yKey: z.string(),
  groupKey: z.string().optional(),
})
```

Zod 在这里做了两件事：
1. **约束 AI 输出** — 生成的 tool call 参数必须符合 schema（类型、枚举值、必填/可选）
2. **运行时校验** — 即使 AI 输出异常，Zod parse 会抛出明确错误而非静默失败

---

## 数据流详解

```
1. 用户点击发送
2. useChat 将 messages POST 到 /api/chat
3. API Route 清洗 messages（去除 toolInvocations），调用 streamText
4. AI 模型流式返回 text + tool_call
5. streamText 检测到 tool_call，执行对应 execute 函数（查询 SQLite）
6. tool 执行结果作为流的一部分推送回客户端
7. useChat 更新 message.toolInvocations（state: "result"）
8. React 根据 toolName 渲染 SqlResult 或 ChartResult
```

## 关键依赖

| 包 | 作用 |
|---|---|
| `ai` | Vercel AI SDK 核心，提供 streamText、useChat |
| `@ai-sdk/openai` | OpenAI 兼容 provider（接阿里云百炼） |
| `zod` | 运行时类型校验，约束 tool parameters |
| `better-sqlite3` | 内存 SQLite，零配置数据库 |
| `recharts` | React 图表库 |
