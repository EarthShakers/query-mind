"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
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

/* ─── types ─── */
interface Turn {
  id: string;
  userContent: string;
  assistantMessages: any[];
}

/* ─── helpers ─── */

function groupTurns(messages: any[]): Turn[] {
  const turns: Turn[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      turns.push({ id: m.id, userContent: m.content, assistantMessages: [] });
    } else if (m.role === "assistant" && turns.length > 0) {
      turns[turns.length - 1].assistantMessages.push(m);
    }
  }
  return turns;
}

const TOOL_LABELS: Record<string, string> = {
  execute_query: "查询数据库",
  show_chart: "生成图表",
  suggest_chart: "分析图表选项",
  search_knowledge: "搜索知识库",
};

const CHART_TYPE_LABELS: Record<string, string> = {
  bar: "柱状图",
  line: "折线图",
  pie: "饼图",
};

function SmallSpinner() {
  return (
    <span className="inline-block w-3 h-3 border-[1.5px] border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
  );
}

/* ─── Collect all tool invocations, deduped ─── */
function useAllTools(assistantMessages: any[]) {
  return useMemo(() => {
    const seen = new Map<string, any>();
    for (const m of assistantMessages) {
      for (const tool of (m.toolInvocations ?? []) as any[]) {
        const existing = seen.get(tool.toolCallId);
        if (!existing || tool.state === "result") {
          seen.set(tool.toolCallId, tool);
        }
      }
    }
    return [...seen.values()];
  }, [assistantMessages]);
}

/* ─── Thinking details (inside collapsible) ─── */
function ThinkingDetails({
  allTools,
  intermediateTexts,
}: {
  allTools: any[];
  intermediateTexts: string[];
}) {
  return (
    <div className="mt-1.5 ml-6 max-h-[40vh] overflow-y-auto space-y-2 border-l-2 border-slate-100 pl-3 text-xs text-slate-400">
      {intermediateTexts.map((text, i) => (
        <p key={`text-${i}`} className="leading-relaxed">
          {text}
        </p>
      ))}
      {allTools.map((tool) => {
        if (tool.state !== "result") {
          return (
            <div
              key={tool.toolCallId}
              className="flex items-center gap-2 py-0.5"
            >
              <SmallSpinner />
              <span>正在{TOOL_LABELS[tool.toolName] || "执行"}...</span>
            </div>
          );
        }
        if (tool.result?.error) {
          return (
            <p key={tool.toolCallId} className="text-amber-500 py-0.5">
              {TOOL_LABELS[tool.toolName] || "工具"}执行出错，正在修正...
            </p>
          );
        }
        if (tool.toolName === "execute_query") {
          return (
            <div key={tool.toolCallId} className="py-0.5 space-y-1">
              <span className="text-slate-500">
                {TOOL_LABELS[tool.toolName]}
              </span>
              {tool.result.sql && (
                <pre className="p-2 bg-slate-50 rounded text-[11px] text-slate-500 overflow-x-auto">
                  {tool.result.sql}
                </pre>
              )}
              {tool.result.data?.length > 0 && (
                <SqlResult sql={tool.result.sql} data={tool.result.data} />
              )}
            </div>
          );
        }
        if (
          tool.toolName === "show_chart" ||
          tool.toolName === "suggest_chart"
        ) {
          return (
            <div key={tool.toolCallId} className="py-0.5">
              <span className="text-slate-500">
                {TOOL_LABELS[tool.toolName]}
              </span>
              {tool.result.sql && (
                <pre className="mt-1 p-2 bg-slate-50 rounded text-[11px] text-slate-500 overflow-x-auto">
                  {tool.result.sql}
                </pre>
              )}
            </div>
          );
        }
        if (tool.toolName === "search_knowledge") {
          const results = tool.result.results ?? [];
          return (
            <div key={tool.toolCallId} className="py-0.5">
              <span className="text-slate-500">
                搜索知识库：{tool.result.query}
              </span>
              <span className="text-slate-300 ml-1">
                — 找到 {results.length} 个相关片段
              </span>
              {results.length > 0 && (
                <div className="mt-1 space-y-1">
                  {results.map((doc: any, i: number) => (
                    <div
                      key={i}
                      className="p-2 bg-slate-50 rounded border border-slate-100"
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-medium text-slate-500">
                          {doc.title}
                        </span>
                        <span className="text-[10px] text-slate-300">
                          {Math.round(doc.similarity * 100)}%
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-3">
                        {doc.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }
        return (
          <p key={tool.toolCallId} className="py-0.5 text-slate-400">
            {TOOL_LABELS[tool.toolName] || tool.toolName} 完成
          </p>
        );
      })}
    </div>
  );
}

/* ─── Chart suggestion button ─── */
function ChartSuggestion({
  tool,
  onAccept,
  accepted,
}: {
  tool: any;
  onAccept: () => void;
  accepted: boolean;
}) {
  const label = CHART_TYPE_LABELS[tool.result.chartType] || "图表";
  if (accepted) {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span>已生成{label}</span>
      </div>
    );
  }
  return (
    <button
      onClick={onAccept}
      className="mt-3 flex items-center gap-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-sm text-indigo-600 font-medium transition-colors"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M7 17V9" />
        <path d="M12 17V5" />
        <path d="M17 17v-3" />
      </svg>
      用{label}展示
    </button>
  );
}

/* ─── Chart bubble with loading transition ─── */
function ChartBubble({ tool, onReady }: { tool: any; onReady: () => void }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setReady(true);
      requestAnimationFrame(() => onReady());
    }, 600);
    return () => clearTimeout(timer);
  }, [onReady]);

  const label = CHART_TYPE_LABELS[tool.result.chartType] || "图表";

  return (
    <div className="flex justify-start">
      <div className="w-full md:max-w-[90%] px-4 py-3 rounded-2xl rounded-tl-sm bg-white border border-slate-200 shadow-sm">
        {!ready ? (
          <div className="flex items-center gap-2 py-8 justify-center text-sm text-slate-400">
            <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
            <span>正在生成{label}...</span>
          </div>
        ) : (
          <ChartResult
            sql={tool.result.sql}
            data={tool.result.data}
            chartType={tool.result.chartType}
            xKey={tool.result.xKey}
            yKey={tool.result.yKey}
            groupKey={tool.result.groupKey}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Single assistant turn ─── */
function AssistantTurn({
  assistantMessages,
  isStreaming,
  onScrollNeeded,
}: {
  assistantMessages: any[];
  isStreaming: boolean;
  onScrollNeeded: () => void;
}) {
  const [acceptedChartIds, setAcceptedChartIds] = useState<Set<string>>(
    () => new Set()
  );
  const allTools = useAllTools(assistantMessages);

  // Messages WITH tool calls → text goes to thinking
  // Messages WITHOUT tool calls → text is final answer
  // Classify text: messages WITH tool calls → thinking, WITHOUT → final answer.
  // IMPORTANT: while streaming, the LAST message might not have toolInvocations yet
  // (text streams before tool calls are attached), so treat it as thinking to avoid
  // premature "已深度思考" flicker.
  const { thinkingTexts, finalText } = useMemo(() => {
    const thinking: string[] = [];
    let answer = "";
    for (let i = 0; i < assistantMessages.length; i++) {
      const m = assistantMessages[i];
      const text = m.content?.trim() || "";
      if (!text) continue;
      const isLastMsg = i === assistantMessages.length - 1;
      if (m.toolInvocations?.length > 0) {
        // Message has tool calls → always thinking
        thinking.push(text);
      } else if (isLastMsg && isStreaming) {
        // Last message while still streaming — tool calls may still arrive,
        // so don't classify as answer yet
        thinking.push(text);
      } else {
        answer = text;
      }
    }
    return { thinkingTexts: thinking, finalText: answer };
  }, [assistantMessages, isStreaming]);

  // Direct charts from show_chart (user explicitly asked for chart)
  const directCharts = useMemo(() => {
    return allTools.filter(
      (t) =>
        t.state === "result" && !t.result?.error && t.toolName === "show_chart"
    );
  }, [allTools]);

  // Chart suggestions from suggest_chart
  const chartSuggestions = useMemo(() => {
    return allTools.filter(
      (t) =>
        t.state === "result" &&
        !t.result?.error &&
        t.toolName === "suggest_chart"
    );
  }, [allTools]);

  // Accepted suggestions → render as chart bubbles
  const acceptedCharts = useMemo(() => {
    return chartSuggestions.filter((t) => acceptedChartIds.has(t.toolCallId));
  }, [chartSuggestions, acceptedChartIds]);

  const hasAnswer = finalText || directCharts.length > 0;
  const hasThinkingContent = allTools.length > 0 || thinkingTexts.length > 0;

  // Simple logic:
  // - isStreaming (= isLoading from useChat) is true for the ENTIRE request lifecycle
  // - Show thinking section if streaming or if there was thinking content
  // - Show "思考中" spinner if isStreaming, "已深度思考" if done
  const showThinking = isStreaming || hasThinkingContent;
  const isStillThinking = isStreaming;

  const toolNames = useMemo(
    () => [
      ...new Set(allTools.map((t) => TOOL_LABELS[t.toolName] || t.toolName)),
    ],
    [allTools]
  );

  const handleAcceptChart = useCallback(
    (toolCallId: string) => {
      setAcceptedChartIds((prev) => new Set(prev).add(toolCallId));
      // Scroll after chart renders
      requestAnimationFrame(() => onScrollNeeded());
    },
    [onScrollNeeded]
  );

  if (!assistantMessages.length && !isStreaming) return null;

  return (
    <>
      {/* ── Main answer bubble ── */}
      <div className="flex justify-start">
        <div className="w-full md:max-w-[90%] px-4 py-3 rounded-2xl rounded-tl-sm bg-white border border-slate-200 shadow-sm">
          {/* Thinking section */}
          {showThinking && (
            <div className={hasAnswer ? "mb-3" : ""}>
              {isStillThinking ? (
                <div className="flex items-center gap-2 py-1.5 text-xs">
                  <span className="relative flex h-4 w-4 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-40" />
                    <span className="relative inline-flex rounded-full h-4 w-4 border-2 border-gray-300 border-t-indigo-500 animate-spin" />
                  </span>
                  <span className="text-slate-500 font-medium">思考中...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 py-1.5 text-xs text-slate-400">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-slate-300 shrink-0"
                  >
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                  </svg>
                  <span>
                    已深度思考
                    {toolNames.length > 0 && (
                      <span className="text-slate-300">
                        {" "}
                        ({toolNames.join("、")})
                      </span>
                    )}
                  </span>
                </div>
              )}
              {hasThinkingContent && (
                <details className="group">
                  <summary className="flex items-center gap-1 cursor-pointer select-none text-[11px] text-slate-300 hover:text-slate-400 transition-colors list-none [&::-webkit-details-marker]:hidden ml-6">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className="transition-transform group-open:rotate-90 shrink-0"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                    <span>查看过程</span>
                  </summary>
                  <ThinkingDetails
                    allTools={allTools}
                    intermediateTexts={thinkingTexts}
                  />
                </details>
              )}
            </div>
          )}

          {/* Direct charts (user explicitly requested) */}
          {directCharts.map((tool) => (
            <ChartResult
              key={tool.toolCallId}
              sql={tool.result.sql}
              data={tool.result.data}
              chartType={tool.result.chartType}
              xKey={tool.result.xKey}
              yKey={tool.result.yKey}
              groupKey={tool.result.groupKey}
            />
          ))}

          {/* Final text answer */}
          {finalText && (
            <p
              className={`text-sm text-slate-700 whitespace-pre-wrap leading-relaxed${
                directCharts.length > 0 ? " mt-3" : ""
              }`}
            >
              {finalText}
            </p>
          )}

          {/* Chart suggestion buttons — only show after streaming ends */}
          {!isStreaming &&
            chartSuggestions.map((tool) => (
              <ChartSuggestion
                key={tool.toolCallId}
                tool={tool}
                accepted={acceptedChartIds.has(tool.toolCallId)}
                onAccept={() => handleAcceptChart(tool.toolCallId)}
              />
            ))}
        </div>
      </div>

      {/* ── Accepted chart bubbles (separate, full-width) ── */}
      {acceptedCharts.map((tool) => (
        <ChartBubble
          key={`chart-${tool.toolCallId}`}
          tool={tool}
          onReady={onScrollNeeded}
        />
      ))}
    </>
  );
}

/* ─── Main page ─── */
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const turns = useMemo(() => groupTurns(messages), [messages]);

  const scrollToBottom = useCallback(() => {
    if (userScrolledUp.current) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  // Detect user scroll: if not at bottom, pause auto-scroll; if back at bottom, resume
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    userScrolledUp.current = !atBottom;
  }, []);

  useEffect(scrollToBottom, [messages, isLoading, scrollToBottom]);

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

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
                userScrolledUp.current = false;
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
        <div className="p-3 border-t border-slate-100">
          <Link
            href="/knowledge"
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
            </svg>
            知识库管理
          </Link>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
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
            用自然语言查询数据、搜索知识库，AI 自动选择最佳方式回答
          </p>
        </header>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
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

          {turns.map((turn, turnIdx) => {
            const isLastTurn = turnIdx === turns.length - 1;
            return (
              <div key={turn.id} className="space-y-4">
                <div className="flex justify-end">
                  <div className="max-w-[85%] md:max-w-[70%] px-4 py-3 rounded-2xl rounded-tr-sm bg-indigo-500 text-white text-sm shadow-sm">
                    {turn.userContent}
                  </div>
                </div>
                <AssistantTurn
                  assistantMessages={turn.assistantMessages}
                  isStreaming={isLastTurn && isLoading}
                  onScrollNeeded={scrollToBottom}
                />
              </div>
            );
          })}

          {error && (
            <div className="flex justify-start">
              <div className="px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-red-500 text-sm">
                {error.message || "请求失败，请重试"}
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 px-4 md:px-6 py-3 md:py-4 border-t border-slate-200 bg-white/60 backdrop-blur">
          <form
            onSubmit={(e) => {
              lastInput.current = input;
              userScrolledUp.current = false;
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
