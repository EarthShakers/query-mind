<div align="center">

# QueryMind

### AI-Powered Natural Language SQL Query Assistant

Ask questions in plain language. Get tables and charts back instantly.

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
- **Generative UI** — AI decides whether to render a table or chart (bar / line / pie)
- **Streaming** — Token-level streaming via `streamText` for real-time response
- **Structured Output** — Zod schema enforces reliable, type-safe AI output
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

| Layer | Technology |
|:------|:-----------|
| Framework | **Next.js 15** (App Router) |
| AI | **Vercel AI SDK** (`streamText` + `useChat`) |
| Validation | **Zod** (structured output) |
| Database | **SQLite** in-memory (`better-sqlite3`) |
| Charts | **Recharts** |
| Styling | **Tailwind CSS** |

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

> Default provider: [Alibaba Cloud Bailian](https://bailian.console.aliyun.com/) (DashScope) with `deepseek-v3.2`. See [Switch Model](#switch-model) for other providers.

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Landing page
│   ├── demo/page.tsx         # Chat demo UI
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

| Table | Fields | Rows |
|:------|:-------|:----:|
| `departments` | id, name, manager_id, budget, location | 6 |
| `employees` | id, name, department_id, title, salary, hire_date, gender | 20 |
| `products` | id, name, category, unit_price | 5 |
| `sales` | id, product_id, employee_id, quantity, amount, sale_date, region | 33 |
| `expenses` | id, department_id, category, amount, month, description | 30 |

## Switch Model

Edit `src/app/api/chat/route.ts`:

```ts
// Alibaba Cloud Bailian (default)
const provider = createOpenAI({
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});
model: provider("deepseek-v3.2")

// OpenAI
const provider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
model: provider("gpt-4o")

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

## License

[MIT](LICENSE)
