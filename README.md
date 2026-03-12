<div align="center">

# QueryMind

**AI-Powered Natural Language Data & Knowledge Assistant**

Ask questions in plain language. Get tables, charts, knowledge answers, and structured reports.

[![Demo](https://img.shields.io/badge/Demo-query--mind--kohl.vercel.app-indigo?style=for-the-badge)](https://query-mind-kohl.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

**[Live Demo](https://query-mind-kohl.vercel.app)** · **[Roadmap](docs/PRODUCT_CAPABILITIES.md)** · **[中文](README.zh-CN.md)**

</div>

---

## Introduction

QueryMind combines **Text-to-SQL**, **RAG knowledge base**, and **report generation** in one interface. Upload documents or data tables, ask questions in natural language, and get instant answers as tables, charts, or structured reports.

Built with Next.js 15 and Vercel AI SDK. Works with OpenAI-compatible APIs (DashScope, OpenAI, DeepSeek, etc.).

## Features

- **Text-to-SQL** — Natural language → SQL. Read-only execution, self-healing on errors. Supports Excel/CSV upload with auto schema.
- **RAG Knowledge Base** — Upload PDF, DOCX, TXT, MD. Vector search with pgvector, Self-Query, optional Rerank and Multi-Query.
- **LangGraph Agent** — For complex multi-step questions: plan → execute → synthesize. Rule-based routing (Schema / search_knowledge). AgentProgress UI.
- **Structured Reports** — Generate reports with markdown, chart, and table sections. Export to PDF or Word.
- **Generative UI** — AI chooses table vs chart (bar/line/pie) based on the question.
- **Spaces & Auth** — Multi-tenant, spaces, roles (admin/editor/viewer). JWT + bcrypt.
- **Rate Limiting** — Tiered quotas for anonymous, personal, and enterprise users.
- **Streaming** — Token-level streaming via `streamText` + `useChat`.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| AI | Vercel AI SDK (`streamText` + `useChat`) |
| RAG | Supabase (pgvector) + DashScope Embedding |
| Database | PostgreSQL (Supabase) + SQLite (demo) |
| Charts | Recharts |
| Auth | JWT + bcrypt |

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (or npm/yarn)

### Install

```bash
git clone https://github.com/zhuochao-li/ai-sql-demo.git
cd ai-sql-demo

pnpm install
cp .env.local.example .env.local
```

Edit `.env.local` and add your API keys:

- `DASHSCOPE_API_KEY` — [Alibaba Cloud Bailian](https://bailian.console.aliyun.com/) (default)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — for RAG and auth

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deployment

**Vercel** (recommended)

1. Push to GitHub
2. Import on [vercel.com](https://vercel.com)
3. Add environment variables
4. Deploy

**Docker**

```bash
docker build -t querymind .
docker run -p 3000:3000 -e DASHSCOPE_API_KEY=sk-xxx querymind
```

## Documentation

- [Roadmap](docs/PRODUCT_CAPABILITIES.md) — Full roadmap and module details
- [Agent Graph](docs/AGENT_GRAPH.md) — LangGraph Agent structure and routing

## License

[MIT](LICENSE)
