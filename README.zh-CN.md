<div align="center">

# QueryMind

### AI 自然语言数据查询助手

用自然语言提问，即时获得表格和图表结果。

[![在线体验](https://img.shields.io/badge/在线体验-query--mind--kohl.vercel.app-indigo?style=for-the-badge)](https://query-mind-kohl.vercel.app)

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![Vercel AI SDK](https://img.shields.io/badge/Vercel%20AI%20SDK-3.4-blue)](https://sdk.vercel.ai)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

**[在线体验](https://query-mind-kohl.vercel.app)** · **[技术文档](https://query-mind-kohl.vercel.app/docs)** · **[English](README.md)**

</div>

---

## 核心特性

- **零 SQL 门槛** — 用自然语言提问，AI 自动生成 SQL 并执行查询
- **智能可视化** — AI 根据问题语义自动选择表格、折线图、柱状图或饼图
- **流式响应** — 基于 Streaming 架构，发出问题后即可看到响应，接近实时对话
- **结构化输出** — Zod Schema 强制约束 AI 输出格式，杜绝格式错误
- **多端适配** — 响应式设计，手机、平板、桌面端均可流畅使用
- **模型灵活切换** — 支持 GPT-4o、DeepSeek、通义千问等任意 OpenAI 兼容 API

## 工作原理

```
用户提问 → useChat (流式) → POST /api/chat → streamText + Zod Tools → AI 模型
                                                      ↓
                                           execute_query / show_chart
                                                      ↓
                                           SQLite 执行 → 返回结果
                                                      ↓
                                客户端根据 toolName 渲染 <SqlResult> / <ChartResult>
```

1. 用户发送自然语言问题
2. AI 通过 **Zod 验证的 Tool Calling** 生成 SQL
3. SQL 在内存 SQLite 数据库中执行
4. AI 自动选择最佳可视化方式 — 表格、柱状图、折线图或饼图
5. 结果以 **流式** 方式逐 token 返回客户端

### 三个核心技术

| 技术 | 解决的问题 | 实现方式 |
|:-----|:----------|:---------|
| **Streaming** | 大模型生成慢，用户需等待 | `streamText` 将输出拆成 token 级别的流，逐块推送 |
| **Generative UI** | 传统 chatbot 只能回复文字 | AI 通过 Tool Calling 决定渲染表格还是图表 |
| **Structured Output** | 大模型输出格式不可控 | Zod Schema 强制约束 AI 返回的参数类型和格式 |

## 技术栈

| 层级 | 技术 |
|:-----|:-----|
| 框架 | **Next.js 15** (App Router) |
| AI | **Vercel AI SDK** (`streamText` + `useChat`) |
| 校验 | **Zod** (结构化输出) |
| 数据库 | **SQLite** 内存数据库 (`better-sqlite3`) |
| 图表 | **Recharts** |
| 样式 | **Tailwind CSS** |

## 快速开始

```bash
# 克隆项目
git clone https://github.com/zhuochao-li/ai-sql-demo.git
cd ai-sql-demo

# 安装依赖
pnpm install

# 配置环境变量
cp .env.local.example .env.local
# 编辑 .env.local，填入 API Key

# 启动开发服务器
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)

> 默认使用[阿里云百炼](https://bailian.console.aliyun.com/)（DashScope）的 `deepseek-v3.2` 模型。如需切换其他模型，参见[切换模型](#切换模型)。

## 项目结构

```
src/
├── app/
│   ├── page.tsx              # 产品首页
│   ├── demo/page.tsx         # AI 查询界面
│   ├── docs/page.tsx         # 技术文档
│   ├── api/chat/route.ts     # AI 流式接口（核心）
│   ├── layout.tsx
│   └── globals.css
├── lib/
│   └── db.ts                 # SQLite 内存数据库 + 预设数据
└── components/
    ├── sql-result.tsx         # 表格组件
    └── chart-result.tsx       # 图表组件（Recharts）
```

## 数据库结构

包含 5 张预置数据表：

| 表名 | 字段 | 数据量 |
|:-----|:-----|:------:|
| `departments` | id, name, manager_id, budget, location | 6 |
| `employees` | id, name, department_id, title, salary, hire_date, gender | 20 |
| `products` | id, name, category, unit_price | 5 |
| `sales` | id, product_id, employee_id, quantity, amount, sale_date, region | 33 |
| `expenses` | id, department_id, category, amount, month, description | 30 |

## 切换模型

修改 `src/app/api/chat/route.ts`：

```ts
// 阿里云百炼（默认）
const provider = createOpenAI({
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});
model: provider("deepseek-v3.2")

// OpenAI
const provider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
model: provider("gpt-4o")

// 任何 OpenAI 兼容 API
const provider = createOpenAI({ baseURL: "https://your-api.com/v1" });
```

### 环境变量

| 变量 | 说明 |
|:-----|:-----|
| `DASHSCOPE_API_KEY` | 阿里云百炼 API Key（[获取地址](https://bailian.console.aliyun.com/)） |

## 部署

### Vercel（推荐）

1. 推送到 GitHub
2. 在 [vercel.com](https://vercel.com) 导入项目
3. 在环境变量中添加 `DASHSCOPE_API_KEY`
4. 部署

### Docker

```bash
docker build -t querymind .
docker run -p 3000:3000 -e DASHSCOPE_API_KEY=sk-xxx querymind
```

## 开源协议

[MIT](LICENSE)
