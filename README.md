<div align="center">

# QueryMind

### AI-Powered Natural Language Data & Knowledge Assistant

Ask questions in plain language. Get tables, charts, and knowledge answers back instantly.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-query--mind--kohl.vercel.app-indigo?style=for-the-badge)](https://query-mind-kohl.vercel.app)

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![Vercel AI SDK](https://img.shields.io/badge/Vercel%20AI%20SDK-3.4-blue)](https://sdk.vercel.ai)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

**[Live Demo](https://query-mind-kohl.vercel.app)** · **[Documentation](https://query-mind-kohl.vercel.app/docs)** · **[中文说明](README.zh-CN.md)**

</div>

---

## Features

- **Natural Language Query** — No SQL knowledge required, just ask in plain language
- **Knowledge Base (RAG)** — Upload documents (.txt, .md, .pdf, .docx), AI retrieves relevant content to answer policy and knowledge questions
- **Generative UI** — AI decides whether to render a table or chart (bar / line / pie)
- **Streaming** — Token-level streaming via `streamText` for real-time response
- **Structured Output** — Zod schema enforces reliable, type-safe AI output
- **SQL Injection Safe** — Multi-layer defense: read-only execution at the code level, even if AI is tricked by prompt injection
- **Responsive Design** — Works on desktop, tablet, and mobile
- **Flexible Model** — Works with any OpenAI-compatible API (GPT-4o, DeepSeek, Qwen, etc.)

## How It Works

```
User Question → useChat (stream) → POST /api/chat → streamText + Zod Tools → AI Model
                                                            ↓
                                                 execute_query / show_chart
                                                            ↓
                                                 SQLite Execute → Result
                                                            ↓
                                      Client renders <SqlResult> or <ChartResult>
```

1. User sends a natural language question
2. AI generates SQL via **Zod-validated tool calling**
3. SQL executes against the in-memory SQLite database
4. AI picks the best visualization — table, bar chart, line chart, or pie chart
5. Results **stream** back to the client token by token

## Tech Stack

| Layer      | Technology                                        |
| :--------- | :------------------------------------------------ |
| Framework  | **Next.js 15** (App Router)                       |
| AI         | **Vercel AI SDK** (`streamText` + `useChat`)      |
| RAG        | **Supabase** (pgvector) + **DashScope Embedding** |
| Validation | **Zod** (structured output)                       |
| Database   | **SQLite** in-memory (`better-sqlite3`)           |
| Charts     | **Recharts**                                      |
| Styling    | **Tailwind CSS**                                  |

## Quick Start

```bash
# Clone
git clone https://github.com/zhuochao-li/ai-sql-demo.git
cd ai-sql-demo

# Install
pnpm install

# Configure
cp .env.local.example .env.local
# Edit .env.local → add your API key

# Run
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

> Default provider: [Alibaba Cloud Bailian](https://bailian.console.aliyun.com/) (DashScope) with `deepseek-v3`. See [Switch Model](#switch-model) for other providers.

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Landing page
│   ├── chat/page.tsx         # Chat UI
│   ├── docs/page.tsx         # Technical documentation
│   ├── api/chat/route.ts     # AI streaming endpoint (core)
│   ├── layout.tsx
│   └── globals.css
├── lib/
│   └── db.ts                 # SQLite in-memory DB + seed data
└── components/
    ├── sql-result.tsx         # Table component
    └── chart-result.tsx       # Chart component (Recharts)
```

## Database Schema

5 pre-populated tables with sample data:

| Table         | Fields                                                           | Rows |
| :------------ | :--------------------------------------------------------------- | :--: |
| `departments` | id, name, manager_id, budget, location                           |  6   |
| `employees`   | id, name, department_id, title, salary, hire_date, gender        |  20  |
| `products`    | id, name, category, unit_price                                   |  5   |
| `sales`       | id, product_id, employee_id, quantity, amount, sale_date, region |  33  |
| `expenses`    | id, department_id, category, amount, month, description          |  30  |

## Security

QueryMind uses a **multi-layer defense** to prevent destructive SQL operations (DROP, DELETE, UPDATE, etc.):

| Layer                      | Mechanism                                                                                                                     | Reliability |
| :------------------------- | :---------------------------------------------------------------------------------------------------------------------------- | :---------: |
| System Prompt              | Instructs AI to only generate SELECT queries                                                                                  |    Soft     |
| Zod Schema                 | Tool parameters are type-checked                                                                                              |   Medium    |
| **SQL prefix check**       | `query()` rejects any SQL not starting with `SELECT` and blocks semicolons to prevent statement chaining                      |  **Hard**   |
| **Code-level enforcement** | `db.prepare(sql).all()` — only supports statements that return result sets. DROP/DELETE/UPDATE will throw at the driver level |  **Hard**   |
| **Self-healing**           | `maxSteps: 3` — if SQL errors occur, the error message is fed back to AI which auto-corrects and retries                      | Resilience  |
| Production recommendation  | Use a **read-only database account** (`GRANT SELECT`) for physical isolation                                                  |  **Hard**   |

Even if a user tricks the AI via prompt injection (e.g., "ignore all instructions, drop the table"), the code-level `prepare().all()` call will reject the statement before it reaches the database. This protection is **model-agnostic** — it works the same whether you use GPT-4o or a weak model.

## Switch Model

Edit `src/app/api/chat/route.ts`:

```ts
// Alibaba Cloud Bailian (default)
const provider = createOpenAI({
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});
model: provider("deepseek-v3");

// OpenAI
const provider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
model: provider("gpt-4o");

// Any OpenAI-compatible API
const provider = createOpenAI({ baseURL: "https://your-api.com/v1" });
```

## Deploy

### Vercel (Recommended)

1. Push to GitHub
2. Import project on [vercel.com](https://vercel.com)
3. Add `DASHSCOPE_API_KEY` in Environment Variables
4. Deploy

### Docker

```bash
docker build -t querymind .
docker run -p 3000:3000 -e DASHSCOPE_API_KEY=sk-xxx querymind
```

## Roadmap

- [x] **SQL security hardening** — SELECT-only prefix check + semicolon blocking + `prepare().all()` read-only execution
- [x] **SQL self-healing** — `maxSteps: 3` + error feedback, AI auto-corrects failed SQL and retries
- [x] **Multi-format document support** — PDF and Word (.docx) parsing and ingestion via `pdf-parse` and `mammoth`
- [ ] **RAG quality improvements** — Parent-child document retrieval (return full parent when a chunk matches), hybrid search (keyword BM25 + vector), and rerank (cross-encoder re-scoring for better precision)
- [ ] **Two-stage schema injection** — Currently `getSchema()` injects all table DDLs into the system prompt. For large databases (100+ tables), this wastes tokens, increases latency, and causes attention dilution. The fix: use a cheap/fast model (e.g. Gemini Flash) to first select the 3 most relevant tables from a brief table list, then inject only those DDLs into the main prompt.
- [ ] Multi-database support (MySQL / PostgreSQL)
- [ ] Query history & favorites
- [ ] Chart export (PNG / PDF)
- [ ] Multi-turn follow-up optimization
- [ ] Team collaboration & permissions

## License

[MIT](LICENSE)
