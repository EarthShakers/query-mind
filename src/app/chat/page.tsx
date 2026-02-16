"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useChat } from "ai/react";
import { SqlResult } from "@/components/sql-result";
import { ChartResult } from "@/components/chart-result";

const QUICK_QUESTIONS = [
  { icon: "👥", text: "显示所有员工及其部门" },
  { icon: "💰", text: "各部门平均薪资对比" },
  { icon: "📊", text: "各产品月度销售额趋势" },
  { icon: "🌍", text: "各区域销售额占比" },
  { icon: "📉", text: "各部门每月支出对比" },
  { icon: "🏆", text: "销售额最高的员工排名" },
  { icon: "👫", text: "男女员工薪资分布对比" },
  { icon: "📢", text: "市场部广告投放费用变化" },
  { icon: "🏢", text: "各部门预算与实际支出对比" },
  { icon: "📦", text: "各产品销量排行榜" },
  { icon: "🗓️", text: "每月新入职员工数量趋势" },
  { icon: "💵", text: "各成本类型支出占比" },
];

function Spinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
  );
}

function ToolResult({ toolInvocations }: { toolInvocations?: unknown[] }) {
  if (!toolInvocations?.length) return null;

  const seen = new Map<string, any>();
  for (const tool of toolInvocations as any[]) {
    const existing = seen.get(tool.toolCallId);
    if (!existing || tool.state === "result") {
      seen.set(tool.toolCallId, tool);
    }
  }

  return (
    <>
      {[...seen.values()].map((tool) => {
        if (tool.state !== "result") {
          return (
            <div
              key={tool.toolCallId}
              className="flex items-center gap-2 text-gray-400 py-3"
            >
              <Spinner />
              <span className="text-sm">正在查询...</span>
            </div>
          );
        }
        if (tool.toolName === "execute_query") {
          if (tool.result.error) {
            return (
              <p key={tool.toolCallId} className="text-xs text-amber-500 py-1">
                SQL 执行出错，AI 正在修正...
              </p>
            );
          }
          return (
            <SqlResult
              key={tool.toolCallId}
              sql={tool.result.sql}
              data={tool.result.data}
            />
          );
        }
        if (tool.toolName === "show_chart") {
          if (tool.result.error) {
            return (
              <p key={tool.toolCallId} className="text-xs text-amber-500 py-1">
                SQL 执行出错，AI 正在修正...
              </p>
            );
          }
          return (
            <ChartResult
              key={tool.toolCallId}
              sql={tool.result.sql}
              data={tool.result.data}
              chartType={tool.result.chartType}
              xKey={tool.result.xKey}
              yKey={tool.result.yKey}
              groupKey={tool.result.groupKey}
            />
          );
        }
        return null;
      })}
    </>
  );
}

export default function Page() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const lastInput = useRef("");
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    setInput,
    append,
  } = useChat({
    onError: () => {
      setInput(lastInput.current);
    },
  });
  console.log(
    messages,
    input,
    isLoading,
    error,
    "messages,input,isLoading,error"
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isLoading]);

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-slate-200 bg-white/95 backdrop-blur flex flex-col transform transition-transform duration-200 md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <Link
            href="/"
            className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent"
          >
            QueryMind
          </Link>
          <button
            className="md:hidden p-1 text-slate-400 hover:text-slate-600"
            onClick={() => setSidebarOpen(false)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <div className="px-4 pt-3 pb-1">
          <span className="text-sm font-semibold text-slate-700">快捷提问</span>
          <span className="text-xs ml-2 text-slate-400 mt-1">
            (点击直接查询)
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {QUICK_QUESTIONS.map(({ icon, text }) => (
            <button
              key={text}
              onClick={() => {
                append({ role: "user", content: text });
                setSidebarOpen(false);
              }}
              disabled={isLoading}
              className="flex items-start gap-2 w-full text-left px-3 py-2.5 text-sm text-slate-600 rounded-lg hover:bg-indigo-50 hover:text-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="shrink-0 text-base leading-5">{icon}</span>
              <span className="leading-5">{text}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="shrink-0 px-4 md:px-6 py-3 md:py-4 border-b border-slate-200 bg-white/60 backdrop-blur flex items-center gap-3">
          <button
            className="md:hidden p-1.5 -ml-1 text-slate-500 hover:text-slate-700"
            onClick={() => setSidebarOpen(true)}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12h18" />
              <path d="M3 6h18" />
              <path d="M3 18h18" />
            </svg>
          </button>
          <p className="text-xs text-slate-400">
            用自然语言查询数据库，AI 自动生成 SQL 并可视化结果
          </p>
        </header>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4"
        >
          {messages.length === 0 && !isLoading && (
            <div className="flex items-center justify-center h-full text-slate-300">
              <div className="text-center">
                <p className="text-4xl mb-3">🔍</p>
                <p className="text-sm">
                  在下方输入问题，或点击左侧快捷提问开始
                </p>
              </div>
            </div>
          )}

          {messages.map((m, idx) => {
            const isLast = idx === messages.length - 1;
            const showLoading =
              isLast &&
              isLoading &&
              m.role === "assistant" &&
              !m.toolInvocations?.length;

            if (m.role === "user") {
              return (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] md:max-w-[70%] px-4 py-3 rounded-2xl rounded-tr-sm bg-indigo-500 text-white text-sm shadow-sm">
                    {m.content}
                  </div>
                </div>
              );
            }

            return (
              <div key={m.id} className="flex justify-start">
                <div className="max-w-[95%] md:max-w-[85%] px-4 py-3 rounded-2xl rounded-tl-sm bg-white border border-slate-200 shadow-sm">
                  {m.content && (
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {m.content}
                    </p>
                  )}
                  <ToolResult toolInvocations={m.toolInvocations} />
                  {showLoading && (
                    <div className="flex items-center gap-2 text-slate-400 mt-2">
                      <Spinner />
                      <span className="text-sm">正在执行...</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isLoading &&
            (!messages.length ||
              messages[messages.length - 1].role === "user") && (
              <div className="flex justify-start">
                <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Spinner />
                    <span className="text-sm">思考中...</span>
                  </div>
                </div>
              </div>
            )}

          {error && (
            <div className="flex justify-start">
              <div className="px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-red-500 text-sm">
                请求失败，请重试
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 px-4 md:px-6 py-3 md:py-4 border-t border-slate-200 bg-white/60 backdrop-blur">
          <form
            onSubmit={(e) => {
              lastInput.current = input;
              handleSubmit(e);
            }}
            className="flex gap-2 md:gap-3 max-w-3xl mx-auto"
          >
            <input
              value={input}
              onChange={handleInputChange}
              placeholder="输入你想查询的数据..."
              className="flex-1 min-w-0 bg-white border border-slate-200 rounded-xl px-3 md:px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent shadow-sm placeholder:text-slate-300"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="shrink-0 px-4 md:px-5 py-3 bg-indigo-500 text-white text-sm font-medium rounded-xl hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              发送
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
