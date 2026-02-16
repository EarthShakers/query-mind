import Link from "next/link";

const SECTIONS = [
  { id: "overview", label: "概述" },
  { id: "architecture", label: "架构" },
  { id: "streaming", label: "流式传输" },
  { id: "generative-ui", label: "生成式 UI" },
  { id: "structured-output", label: "结构化输出" },
  { id: "database", label: "数据库" },
  { id: "api", label: "API 参考" },
  { id: "deploy", label: "部署" },
  { id: "changelog", label: "版本记录" },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent"
          >
            QueryMind
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/" className="text-slate-500 hover:text-slate-800">
              首页
            </Link>
            <Link
              href="/chat"
              className="px-4 py-1.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
            >
              在线体验
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto flex">
        {/* Sidebar */}
        <aside className="w-52 shrink-0 py-8 pr-6 border-r border-slate-100 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto hidden md:block">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-3">
            文档
          </p>
          <nav className="space-y-1">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="block px-3 py-2 text-sm text-slate-500 rounded-lg hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
              >
                {s.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 py-8 md:py-12 px-4 md:px-8 max-w-none prose prose-slate prose-headings:scroll-mt-20 prose-h2:text-xl md:prose-h2:text-2xl prose-h2:font-bold prose-h2:border-b prose-h2:border-slate-100 prose-h2:pb-3 prose-h3:text-lg prose-pre:bg-slate-900 prose-pre:text-sm prose-pre:overflow-x-auto">
          <h1 className="text-2xl md:text-3xl font-bold mb-2 not-prose">
            技术文档
          </h1>
          <p className="text-slate-500 mb-12 not-prose">
            QueryMind 核心技术原理与 API 参考
          </p>

          {/* Overview */}
          <h2 id="overview">概述</h2>
          <p>
            QueryMind 是一款 AI 数据查询助手，核心能力是将自然语言转换为 SQL
            查询，并智能选择可视化方式展示结果。 技术栈基于 Next.js + Vercel AI
            SDK + Zod，通过三个核心技术实现：
          </p>
          <ul>
            <li>
              <strong>Streaming</strong> — 流式传输，解决大模型输出慢的体验问题
            </li>
            <li>
              <strong>Generative UI</strong> — 生成式 UI，AI 决定渲染哪个组件
            </li>
            <li>
              <strong>Structured Output</strong> — 结构化输出，Zod 强制约束 AI
              返回格式
            </li>
          </ul>

          {/* Architecture */}
          <h2 id="architecture">架构</h2>
          <pre className="not-prose">
            <code>{`用户输入 → useChat (流式) → POST /api/chat → streamText + Zod Tools → AI 模型
                                                          ↓
                                               execute_query / show_chart
                                                          ↓
                                               SQLite 执行 → 结果回传
                                                          ↓
                                    客户端根据 toolName 渲染 <SqlResult> / <ChartResult>`}</code>
          </pre>
          <h3>文件结构</h3>
          <pre className="not-prose">
            <code>{`src/
├── app/
│   ├── page.tsx              # 产品首页
│   ├── chat/page.tsx         # AI 查询界面
│   ├── docs/page.tsx         # 技术文档
│   ├── api/chat/route.ts     # AI API Route（核心）
│   ├── layout.tsx
│   └── globals.css
├── lib/
│   └── db.ts                 # SQLite 内存数据库 + Schema
└── components/
    ├── sql-result.tsx         # 表格组件
    └── chart-result.tsx       # 图表组件（Recharts）`}</code>
          </pre>

          {/* Streaming */}
          <h2 id="streaming">流式传输</h2>
          <p>
            <strong>问题：</strong>
            大模型生成慢（数秒到数十秒），用户需要等待全部输出完成才能看到结果。
          </p>
          <p>
            <strong>方案：</strong>Vercel AI SDK 的 <code>streamText</code>{" "}
            将模型输出拆成 token 级别的流，通过 <code>ReadableStream</code>{" "}
            逐块推送到前端。
          </p>
          <h3>服务端</h3>
          <pre className="not-prose">
            <code>{`// src/app/api/chat/route.ts
import { streamText } from "ai";

const result = await streamText({
  model: provider("model-name"),
  messages: sanitizedMessages,
  tools: { ... },
});

return result.toDataStreamResponse(); // 转为 HTTP 流响应`}</code>
          </pre>
          <h3>客户端</h3>
          <pre className="not-prose">
            <code>{`// src/app/chat/page.tsx
import { useChat } from "ai/react";

const { messages, input, handleSubmit } = useChat();
// messages 状态随流实时更新，UI 自动重渲染`}</code>
          </pre>
          <p>
            <code>useChat</code> 内部使用 <code>EventSource</code> 消费流，
            每收到一个 chunk 就更新 React 状态，实现逐字渲染效果。
          </p>

          {/* Generative UI */}
          <h2 id="generative-ui">生成式 UI</h2>
          <p>
            <strong>问题：</strong>传统 chatbot
            只能回复文字，无法展示结构化内容（表格、图表）。
          </p>
          <p>
            <strong>方案：</strong>AI 通过 Tool Calling
            机制决定调用哪个工具，客户端根据 <code>toolName</code> 渲染对应的
            React 组件。
          </p>
          <pre className="not-prose">
            <code>{`AI 判断意图
├── 需要数据列表 → 调用 execute_query → 前端渲染 <SqlResult>
└── 需要可视化   → 调用 show_chart    → 前端渲染 <ChartResult>`}</code>
          </pre>
          <p>
            <strong>关键点：UI 由 AI 决定，而非前端硬编码。</strong>
            同一句话"各部门薪资"，AI 可能选表格也可能选柱状图，这就是 Generative
            UI 的核心。
          </p>
          <h3>客户端渲染逻辑</h3>
          <pre className="not-prose">
            <code>{`// 根据 tool 调用结果渲染不同组件
{message.toolInvocations?.map((tool) => {
  if (tool.toolName === "execute_query")
    return <SqlResult sql={tool.result.sql} data={tool.result.data} />;
  if (tool.toolName === "show_chart")
    return <ChartResult {...tool.result} />;
})}`}</code>
          </pre>

          {/* Structured Output */}
          <h2 id="structured-output">结构化输出</h2>
          <p>
            <strong>问题：</strong>大模型输出不可控，可能返回格式错误的 JSON。
          </p>
          <p>
            <strong>方案：</strong>用 Zod Schema 定义 Tool 参数，AI SDK
            强制模型输出必须符合 schema。
          </p>
          <pre className="not-prose">
            <code>{`import { z } from "zod";

// show_chart tool 的参数约束
parameters: z.object({
  sql: z.string().describe("The SQLite query"),
  chartType: z.enum(["bar", "line", "pie"]),  // 只能是这三个值
  xKey: z.string(),
  yKey: z.string(),
  groupKey: z.string().optional(),            // 可选分组字段
})`}</code>
          </pre>
          <p>Zod 的双重作用：</p>
          <ol>
            <li>
              <strong>约束 AI 输出</strong> —
              模型生成的参数必须符合类型、枚举值、必填规则
            </li>
            <li>
              <strong>运行时校验</strong> — 即使模型返回异常数据，Zod parse
              抛出明确错误而非静默失败
            </li>
          </ol>

          {/* Database */}
          <h2 id="database">数据库</h2>
          <p>
            使用内存 SQLite（<code>better-sqlite3</code>），包含 5
            张预置数据表：
          </p>
          <div className="not-prose overflow-x-auto rounded-xl border border-slate-200 my-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    表名
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    字段
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    数据量
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-4 py-2.5 font-mono text-indigo-600">
                    departments
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    id, name, manager_id, budget, location
                  </td>
                  <td className="px-4 py-2.5">6</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-mono text-indigo-600">
                    employees
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    id, name, department_id, title, salary, hire_date, gender
                  </td>
                  <td className="px-4 py-2.5">20</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-mono text-indigo-600">
                    products
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    id, name, category, unit_price
                  </td>
                  <td className="px-4 py-2.5">5</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-mono text-indigo-600">
                    sales
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    id, product_id, employee_id, quantity, amount, sale_date,
                    region
                  </td>
                  <td className="px-4 py-2.5">33</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-mono text-indigo-600">
                    expenses
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    id, department_id, category, amount, month, description
                  </td>
                  <td className="px-4 py-2.5">30</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            生产环境可替换为 MySQL / PostgreSQL，只需修改 <code>db.ts</code>{" "}
            中的连接配置。
          </p>

          {/* API */}
          <h2 id="api">API 参考</h2>
          <h3>POST /api/chat</h3>
          <p>主要 API 端点，接收对话消息，返回流式响应。</p>
          <h4 className="text-base font-semibold">请求</h4>
          <pre className="not-prose">
            <code>{`POST /api/chat
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "各部门平均薪资对比" }
  ]
}`}</code>
          </pre>
          <h4 className="text-base font-semibold">响应</h4>
          <p>
            <code>Content-Type: text/plain</code> — Vercel AI SDK Data Stream
            Protocol 格式，包含：
          </p>
          <ul>
            <li>文本 token（逐字推送）</li>
            <li>Tool call 信息（toolName, args）</li>
            <li>Tool result（执行结果数据）</li>
          </ul>
          <h3>Tools</h3>
          <div className="not-prose overflow-x-auto rounded-xl border border-slate-200 my-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    Tool
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    参数
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    用途
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-4 py-2.5 font-mono text-indigo-600">
                    execute_query
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">sql: string</td>
                  <td className="px-4 py-2.5">执行 SQL，返回表格数据</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-mono text-indigo-600">
                    show_chart
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    sql, chartType, xKey, yKey, groupKey?
                  </td>
                  <td className="px-4 py-2.5">执行 SQL，返回图表数据</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Deploy */}
          <h2 id="deploy">部署</h2>
          <h3>本地开发</h3>
          <pre className="not-prose">
            <code>{`git clone <repo>
cd ai-sql-demo
pnpm install
cp .env.local.example .env.local  # 填入 API Key
pnpm dev`}</code>
          </pre>
          <h3>环境变量</h3>
          <div className="not-prose overflow-x-auto rounded-xl border border-slate-200 my-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    变量
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    说明
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-4 py-2.5 font-mono">DASHSCOPE_API_KEY</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    阿里云百炼 API Key
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <h3>切换 AI 模型</h3>
          <p>
            修改 <code>src/app/api/chat/route.ts</code> 中的 provider 和 model
            即可：
          </p>
          <pre className="not-prose">
            <code>{`// 阿里云百炼 (当前)
const provider = createOpenAI({
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});
model: provider("deepseek-v3.2")

// OpenAI
const provider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
model: provider("gpt-4o")

// 任何 OpenAI 兼容 API
const provider = createOpenAI({ baseURL: "https://your-api.com/v1" });`}</code>
          </pre>

          {/* Changelog */}
          <h2 id="changelog">版本记录</h2>

          <h3>v0.4.0 — 安全加固 & 自我修复</h3>
          <ul>
            <li>
              <code>query()</code> 新增 SELECT 前缀校验 +
              分号拦截，defense-in-depth 防止破坏性 SQL
            </li>
            <li>
              <code>maxSteps: 3</code> — AI 生成的 SQL
              执行报错时自动修正并重试，优化提示词防止大模型错误行为
            </li>
            <li>
              Tool execute 增加 try/catch，错误信息回传 AI 触发 self-healing
            </li>
            <li>前端识别 error 态，显示"SQL 执行出错，AI 正在修正..."</li>
          </ul>

          <h3>v0.3.0 — 多端适配 & 部署</h3>
          <ul>
            <li>全站响应式适配（手机 / 平板 / 桌面）</li>
            <li>Chat 页侧边栏改为移动端抽屉式，hamburger 按钮切换</li>
            <li>新增 Dockerfile（多阶段构建 + standalone 输出）</li>
            <li>
              Next.js 配置 <code>output: &apos;standalone&apos;</code>
            </li>
            <li>
              添加 <code>.dockerignore</code>、<code>.gitignore</code>、
              <code>.env.local.example</code>
            </li>
          </ul>

          <h3>v0.2.0 — 产品化</h3>
          <ul>
            <li>产品官网首页（Hero / 功能 / 竞品对比 / 定价 / CTA）</li>
            <li>技术文档页（侧边栏导航 + prose 排版）</li>
            <li>
              Chat 页移至 <code>/chat</code>，首页改为 Landing Page
            </li>
            <li>
              数据库扩充至 5 张表（departments / employees / products / sales /
              expenses），共 94 条数据
            </li>
            <li>12 个快捷提问按钮</li>
            <li>图表 groupKey 支持（多系列柱状图 / 折线图）</li>
            <li>Chat UI 重构：气泡式消息、可折叠 SQL、多阶段 loading</li>
          </ul>

          <h3>v0.1.0 — MVP</h3>
          <ul>
            <li>自然语言 → SQL → 表格 / 图表，核心流程跑通</li>
            <li>
              Vercel AI SDK <code>streamText</code> + <code>useChat</code>{" "}
              流式架构
            </li>
            <li>Zod Schema 结构化输出（Tool Calling）</li>
            <li>
              两个 Tool：<code>execute_query</code>（表格）、
              <code>show_chart</code>（Bar / Line / Pie）
            </li>
            <li>
              内存 SQLite（<code>better-sqlite3</code>）
            </li>
            <li>
              消息清洗（sanitizeMessages）解决 toolInvocations 二次请求报错
            </li>
            <li>
              <code>toDataStreamResponse()</code> 替代{" "}
              <code>toAIStreamResponse()</code> 解决工具结果不回传
            </li>
          </ul>

          <div className="not-prose mt-16 pt-8 border-t border-slate-100 text-center">
            <Link
              href="/chat"
              className="inline-block px-6 py-3 bg-indigo-500 text-white rounded-xl text-sm font-medium hover:bg-indigo-600 transition-colors"
            >
              前往体验 →
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
