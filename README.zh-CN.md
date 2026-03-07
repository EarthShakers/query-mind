<div align="center">

# QueryMind

**AI 驱动的自然语言数据与知识助手**

用自然语言提问，获得表格、图表、知识回答与结构化报告。

[![在线体验](https://img.shields.io/badge/在线体验-query--mind--kohl.vercel.app-indigo?style=for-the-badge)](https://query-mind-kohl.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

**[在线体验](https://query-mind-kohl.vercel.app)** · **[路线图](docs/PRODUCT_CAPABILITIES.md)** · **[English](README.md)**

</div>

---

## 简介

QueryMind 将 **Text-to-SQL**、**RAG 知识库** 和 **报告生成** 整合在一个界面。上传文档或数据表，用自然语言提问，即可获得表格、图表或结构化报告形式的回答。

基于 Next.js 15 和 Vercel AI SDK 构建。支持 OpenAI 兼容 API（DashScope、OpenAI、DeepSeek 等）。

## 功能特性

- **Text-to-SQL** — 自然语言转 SQL。只读执行，错误自动重试。支持 Excel/CSV 上传并自动建表。
- **RAG 知识库** — 上传 PDF、DOCX、TXT、MD。pgvector 向量检索，Self-Query，可选 Rerank 与 Multi-Query。
- **结构化报告** — 生成含 markdown、图表、表格章节的报告。导出 PDF 或 Word。
- **生成式 UI** — AI 根据问题自动选择表格或图表（柱状/折线/饼图）。
- **空间与认证** — 多租户、空间、角色（admin/editor/viewer）。JWT + bcrypt。
- **限流** — 匿名、个人、企业差异化配额。
- **流式输出** — `streamText` + `useChat` 逐 token 流式响应。

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router) |
| AI | Vercel AI SDK (`streamText` + `useChat`) |
| RAG | Supabase (pgvector) + DashScope Embedding |
| 数据库 | PostgreSQL (Supabase) + SQLite (演示) |
| 图表 | Recharts |
| 认证 | JWT + bcrypt |

## 快速开始

### 环境要求

- Node.js 18+
- pnpm（或 npm/yarn）

### 安装

```bash
git clone https://github.com/zhuochao-li/ai-sql-demo.git
cd ai-sql-demo

pnpm install
cp .env.local.example .env.local
```

编辑 `.env.local` 并填入 API 密钥：

- `DASHSCOPE_API_KEY` — [阿里云百炼](https://bailian.console.aliyun.com/)（默认）
- `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` — RAG 与认证

```bash
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)

## 部署

**Vercel**（推荐）

1. 推送到 GitHub
2. 在 [vercel.com](https://vercel.com) 导入项目
3. 配置环境变量
4. 部署

**Docker**

```bash
docker build -t querymind .
docker run -p 3000:3000 -e DASHSCOPE_API_KEY=sk-xxx querymind
```

## 文档

- [路线图](docs/PRODUCT_CAPABILITIES.md) — 完整路线图与模块说明

## 开源协议

[MIT](LICENSE)
