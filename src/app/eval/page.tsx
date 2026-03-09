"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { NavAuth } from "@/components/nav-auth";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface EvalRun {
  id: number;
  run_mode: string;
  faithfulness: number;
  answer_relevancy: number;
  context_precision: number;
  context_recall: number;
  sample_count: number;
  dataset_path: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

const METRICS = [
  { key: "faithfulness", label: "Faithfulness", color: "#6366f1" },
  { key: "answer_relevancy", label: "Answer Relevancy", color: "#06b6d4" },
  { key: "context_precision", label: "Context Precision", color: "#f59e0b" },
  { key: "context_recall", label: "Context Recall", color: "#10b981" },
] as const;

function scoreColor(v: number) {
  if (v >= 0.9) return "text-emerald-600";
  if (v >= 0.7) return "text-amber-500";
  return "text-red-500";
}

function progressBg(v: number) {
  if (v >= 0.9) return "bg-emerald-500";
  if (v >= 0.7) return "bg-amber-400";
  return "bg-red-500";
}

function Nav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/80 backdrop-blur-lg">
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent"
        >
          QueryMind
        </Link>
        <div className="flex items-center gap-4 md:gap-6 text-sm">
          <Link
            href="/"
            className="text-slate-500 hover:text-slate-800 transition-colors"
          >
            首页
          </Link>
          <Link
            href="/chat"
            className="px-4 py-1.5 text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            在线体验
          </Link>
          <Link
            href="/knowledge"
            className="text-slate-500 hover:text-slate-800 transition-colors"
          >
            知识库
          </Link>
          <NavAuth />
        </div>
      </div>
    </nav>
  );
}

export default function EvalDashboard() {
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/eval-runs?limit=30")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setRuns(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const latest = runs[0] ?? null;

  // Reverse for chronological order in chart
  const chartData = [...runs].reverse().map((r) => ({
    date: new Date(r.created_at).toLocaleDateString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
    faithfulness: r.faithfulness,
    answer_relevancy: r.answer_relevancy,
    context_precision: r.context_precision,
    context_recall: r.context_recall,
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-8">
        {/* Header */}
        <div className="rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-cyan-500 p-8 text-white">
          <h1 className="text-2xl md:text-3xl font-bold">RAG 评估看板</h1>
          <p className="mt-2 text-indigo-100 text-sm md:text-base">
            追踪 RAG 系统的 Faithfulness、Answer Relevancy、Context Precision、Context Recall 四大指标趋势
          </p>
        </div>

        {loading ? (
          <div className="text-center py-20 text-slate-400">加载中...</div>
        ) : runs.length === 0 ? (
          /* Empty state */
          <div className="text-center py-20">
            <svg
              className="mx-auto mb-4 text-slate-300"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 3v18h18" />
              <path d="m19 9-5 5-4-4-3 3" />
            </svg>
            <p className="text-slate-500 text-lg font-medium">暂无评估数据</p>
            <p className="text-slate-400 text-sm mt-1">
              请先运行 <code className="bg-slate-100 px-2 py-0.5 rounded text-xs">pnpm eval:rag:e2e</code> 生成评估结果
            </p>
          </div>
        ) : (
          <>
            {/* Score cards */}
            {latest && (
              <section>
                <h2 className="text-lg font-semibold text-slate-800 mb-4">最新评估分数</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {METRICS.map((m) => {
                    const val = latest[m.key as keyof EvalRun] as number;
                    return (
                      <div
                        key={m.key}
                        className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm"
                      >
                        <p className="text-xs text-slate-500 mb-1">{m.label}</p>
                        <p className={`text-2xl font-bold ${scoreColor(val)}`}>
                          {(val * 100).toFixed(1)}%
                        </p>
                        <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${progressBg(val)} transition-all`}
                            style={{ width: `${Math.min(val * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Trend chart */}
            {chartData.length > 1 && (
              <section>
                <h2 className="text-lg font-semibold text-slate-800 mb-4">指标趋势</h2>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12, fill: "#94a3b8" }}
                      />
                      <YAxis
                        domain={[0, 1]}
                        tick={{ fontSize: 12, fill: "#94a3b8" }}
                        tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                      />
                      <Tooltip
                        formatter={(value: number) => `${(value * 100).toFixed(1)}%`}
                      />
                      <Legend />
                      {METRICS.map((m) => (
                        <Line
                          key={m.key}
                          type="monotone"
                          dataKey={m.key}
                          name={m.label}
                          stroke={m.color}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {/* History table */}
            <section>
              <h2 className="text-lg font-semibold text-slate-800 mb-4">历史记录</h2>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-500 text-left">
                      <th className="px-4 py-3 font-medium">时间</th>
                      <th className="px-4 py-3 font-medium">模式</th>
                      <th className="px-4 py-3 font-medium text-center">样本数</th>
                      {METRICS.map((m) => (
                        <th key={m.key} className="px-4 py-3 font-medium text-center">
                          {m.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString("zh-CN")}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-600">
                            {r.run_mode}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600">
                          {r.sample_count}
                        </td>
                        {METRICS.map((m) => {
                          const val = r[m.key as keyof EvalRun] as number;
                          return (
                            <td
                              key={m.key}
                              className={`px-4 py-3 text-center font-medium ${scoreColor(val)}`}
                            >
                              {(val * 100).toFixed(1)}%
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
