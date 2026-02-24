"use client";

import { useState, useRef, useEffect, useMemo, useCallback, type RefObject } from "react";
import Link from "next/link";
import { useChat } from "ai/react";
import { SqlResult } from "@/components/sql-result";
import { ChartResult } from "@/components/chart-result";
import { NavAuth } from "@/components/nav-auth";
import { useAuth } from "@/lib/auth-context";
import { useReport } from "@/hooks/use-report";
import { useSectionEdit } from "@/hooks/use-section-edit";
import { useVersionHistory } from "@/hooks/use-version-history";
import { ReportCanvas } from "@/components/report-canvas";
import { VersionHistoryPanel } from "@/components/version-history-panel";
import type { ReportSection } from "@/lib/report-types";

const QUICK_QUESTIONS = [
  { icon: "📋", text: "公司的报销流程是什么" },
  { icon: "🏖️", text: "年假有多少天，怎么申请" },
  { icon: "📖", text: "新员工入职需要准备什么" },
  { icon: "❓", text: "常见问题有哪些" },
  { icon: "📊", text: "帮我分析上传的数据表" },
  { icon: "📈", text: "用图表展示数据趋势" },
  { icon: "🔍", text: "对比各类别的数据占比" },
  { icon: "📑", text: "产品使用指南" },
];

const SIDEBAR_HINT = "以下为快捷提问示例，你也可以上传自己的文档和 Excel 报表进行分析";

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
  execute_query: "查询数据",
  show_chart: "生成图表",
  suggest_chart: "分析图表选项",
  search_knowledge: "搜索知识库",
  write_report_section: "写入报告",
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
              {tool.result.data?.length > 0 && (
                <SqlResult data={tool.result.data} />
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
        if (tool.toolName === "write_report_section") {
          return (
            <div key={tool.toolCallId} className="py-0.5">
              <span className="text-slate-500">
                写入报告：{tool.result.title || tool.result.section_id}
              </span>
              <span className="text-slate-300 ml-1">
                — {tool.result.content_type === "chart" ? "图表" : tool.result.content_type === "table" ? "数据表" : "文字"}
              </span>
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
    const seen = new Set<string>();
    let answer = "";
    for (let i = 0; i < assistantMessages.length; i++) {
      const m = assistantMessages[i];
      const text = m.content?.trim() || "";
      if (!text) continue;
      const isLastMsg = i === assistantMessages.length - 1;
      if (m.toolInvocations?.length > 0) {
        // Message has tool calls → always thinking (deduplicate)
        if (!seen.has(text)) {
          seen.add(text);
          thinking.push(text);
        }
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

  // Detect if all tool calls failed (no answer and tools all errored)
  const toolErrors = useMemo(() => {
    return allTools.filter((t) => t.state === "result" && t.result?.error);
  }, [allTools]);
  const allToolsFailed =
    !isStreaming && !hasAnswer && toolErrors.length > 0 && allTools.every(
      (t) => t.state === "result" && (t.result?.error || t.toolName === "suggest_chart")
    );
  const lastErrorMsg = allToolsFailed
    ? toolErrors[toolErrors.length - 1]?.result?.error
    : "";

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
                <details className="group" open>
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
                    <span className="group-open:hidden">查看过程</span>
                    <span className="hidden group-open:inline">收起过程</span>
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

          {/* Error fallback: all tool calls failed, no answer */}
          {allToolsFailed && (
            <p className="text-sm text-red-500 mt-2">
              查询失败：{lastErrorMsg || "未知错误，请重试"}
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

/* ─── Space Picker (multi-select dropdown for knowledge scope) ─── */
function SpacePicker({
  spaces,
  selected,
  onChange,
}: {
  spaces: { spaceId: string; spaceName: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const allSelected = selected.size === spaces.length && spaces.length > 0;
  const noneSelected = selected.size === 0;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(next);
  }

  function toggleAll() {
    if (allSelected) {
      onChange(new Set());
    } else {
      onChange(new Set(spaces.map((s) => s.spaceId)));
    }
  }

  const statusLabel = noneSelected
    ? "仅查数据"
    : allSelected
    ? "全部空间"
    : selected.size === 1
    ? spaces.find((s) => selected.has(s.spaceId))?.spaceName ?? "1 个空间"
    : `${selected.size} 个空间`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-colors shrink-0 ${
          noneSelected
            ? "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
            : "bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100"
        }`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={noneSelected ? "text-slate-400" : "text-indigo-400"}
        >
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
        </svg>
        <span className="hidden sm:inline text-slate-400 font-normal">知识库:</span>
        <span className="max-w-[100px] truncate">{statusLabel}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${open ? "rotate-180" : ""} ${noneSelected ? "text-slate-400" : "text-indigo-400"}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50">
          <div className="px-4 py-2 border-b border-slate-100">
            <p className="text-[11px] font-medium text-slate-500">知识库搜索范围</p>
            <p className="text-[10px] text-slate-400 mt-0.5">不选择则仅查询数据库，不搜索知识库</p>
          </div>
          <div className="py-1">
            <button
              onClick={toggleAll}
              className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs hover:bg-slate-50 transition-colors ${
                allSelected ? "text-indigo-600 font-medium" : "text-slate-600"
              }`}
            >
              <span
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                  allSelected
                    ? "bg-indigo-500 border-indigo-500"
                    : "border-slate-300"
                }`}
              >
                {allSelected && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                )}
              </span>
              全选
            </button>
            <div className="border-t border-slate-100 my-0.5" />
            {spaces.map((s) => {
              const checked = selected.has(s.spaceId);
              return (
                <button
                  key={s.spaceId}
                  onClick={() => toggle(s.spaceId)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs hover:bg-slate-50 transition-colors ${
                    checked ? "text-indigo-600 font-medium" : "text-slate-600"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      checked
                        ? "bg-indigo-500 border-indigo-500"
                        : "border-slate-300"
                    }`}
                  >
                    {checked && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    )}
                  </span>
                  <span className="truncate">{s.spaceName}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Chat Upload Modal ─── */
function ChatUploadModal({
  spaces,
  onClose,
  onUploaded,
}: {
  spaces: { spaceId: string; spaceName: string }[];
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [tab, setTab] = useState<"docs" | "data">("docs");
  const { user: authUser } = useAuth();
  const [selectedSpaceId, setSelectedSpaceId] = useState(() => {
    return spaces[0]?.spaceId ?? "";
  });
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const accept = tab === "docs" ? ".txt,.md,.pdf,.docx" : ".xlsx,.xls,.csv";

  async function handleFile(file: File) {
    setUploading(true);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("spaceId", selectedSpaceId);
      if (tab === "docs") fd.append("title", file.name.replace(/\.[^.]+$/, ""));

      const url = tab === "docs" ? "/api/documents" : "/api/data-tables";
      const res = await fetch(url, { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `上传失败 (${res.status})`);
      }
      setUploadMsg({ ok: true, text: `${file.name} 上传成功` });
      onUploaded();
    } catch (err: any) {
      setUploadMsg({ ok: false, text: err.message || "上传失败" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  const gradientFrom = tab === "docs" ? "from-indigo-500" : "from-emerald-500";
  const gradientTo = tab === "docs" ? "to-cyan-500" : "to-teal-500";
  const formats = tab === "docs"
    ? [
        { ext: "pdf", color: "text-red-600", bg: "bg-red-50 border-red-100" },
        { ext: "docx", color: "text-blue-600", bg: "bg-blue-50 border-blue-100" },
        { ext: "md", color: "text-violet-600", bg: "bg-violet-50 border-violet-100" },
        { ext: "txt", color: "text-slate-600", bg: "bg-slate-100 border-slate-200" },
      ]
    : [
        { ext: "xlsx", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
        { ext: "xls", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
        { ext: "csv", color: "text-teal-600", bg: "bg-teal-50 border-teal-100" },
      ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header with gradient */}
        <div className={`px-6 pt-6 pb-4 bg-gradient-to-r ${gradientFrom} ${gradientTo}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                  <path d="M12 18v-6" />
                  <path d="m9 15 3-3 3 3" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">上传文件</h3>
                <p className="text-xs text-white/70 mt-0.5">上传到知识库，即可在对话中使用</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => { setTab("docs"); setUploadMsg(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all ${
                tab === "docs" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
              </svg>
              知识文档
            </button>
            <button
              onClick={() => { setTab("data"); setUploadMsg(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all ${
                tab === "data" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M7 7h10" /><path d="M7 12h10" /><path d="M7 17h10" />
              </svg>
              数据报表
            </button>
          </div>

          {/* Space selector */}
          <label className="block">
            <span className="text-xs font-medium text-slate-500 mb-1.5 block">目标空间</span>
            <select
              value={selectedSpaceId}
              onChange={(e) => setSelectedSpaceId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-colors"
            >
              {spaces.map((s) => (
                <option key={s.spaceId} value={s.spaceId}>{s.spaceName}</option>
              ))}
            </select>
          </label>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !uploading && fileRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
              dragOver
                ? tab === "docs"
                  ? "border-indigo-400 bg-indigo-50 shadow-md"
                  : "border-emerald-400 bg-emerald-50 shadow-md"
                : uploading
                ? tab === "docs"
                  ? "border-indigo-300 bg-indigo-50/50"
                  : "border-emerald-300 bg-emerald-50/50"
                : "border-slate-200 hover:border-indigo-300 hover:shadow-md"
            }`}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-3 py-2">
                <span className={`w-10 h-10 border-[3px] rounded-full animate-spin ${
                  tab === "docs"
                    ? "border-indigo-200 border-t-indigo-500"
                    : "border-emerald-200 border-t-emerald-500"
                }`} />
                <p className="text-sm font-medium text-slate-600">
                  {tab === "docs" ? "正在解析并向量化文档..." : "正在解析数据表..."}
                </p>
              </div>
            ) : (
              <>
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradientFrom} ${gradientTo} flex items-center justify-center shadow-sm mx-auto mb-3`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" x2="12" y1="3" y2="15" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-700">拖拽文件到此处，或点击选择</p>
                <div className="flex items-center justify-center gap-1.5 mt-3">
                  {formats.map((f) => (
                    <span key={f.ext} className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${f.bg} ${f.color}`}>
                      .{f.ext}
                    </span>
                  ))}
                </div>
              </>
            )}
            <input ref={fileRef} type="file" accept={accept} onChange={onFileChange} className="hidden" />
          </div>

          {/* Upload result */}
          {uploadMsg && (
            <div className={`px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 ${
              uploadMsg.ok
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-600 border border-red-200"
            }`}>
              <span className="text-base">{uploadMsg.ok ? "\u2713" : "!"}</span>
              <span className="flex-1">{uploadMsg.text}</span>
              {!authUser && !uploadMsg.ok && uploadMsg.text.includes("上限") && (
                <Link
                  href="/register"
                  className="shrink-0 px-3 py-1 text-xs font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors"
                >
                  免费注册
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const DEMO_SPACE_ID = "00000000-0000-0000-0000-000000000001";

/* ─── Export Dropdown ─── */
function ExportDropdown({
  canvasRef,
  title,
  sections,
}: {
  canvasRef: RefObject<HTMLDivElement | null>;
  title: string;
  sections: import("@/lib/report-types").ReportSection[];
}) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleExportPdf() {
    if (!canvasRef.current) return;
    setExporting(true);
    setOpen(false);
    try {
      const { exportToPdf } = await import("@/lib/export-pdf");
      await exportToPdf(canvasRef.current, title);
    } finally {
      setExporting(false);
    }
  }

  async function handleExportWord() {
    setExporting(true);
    setOpen(false);
    try {
      const { exportToWord } = await import("@/lib/export-word");
      await exportToWord(title, sections);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={exporting}
        className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" x2="12" y1="15" y2="3" />
        </svg>
        {exporting ? "导出中..." : "导出"}
        {!exporting && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? "rotate-180" : ""}`}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        )}
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-36 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50">
          <button
            onClick={handleExportPdf}
            className="w-full flex items-center gap-2 px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            导出 PDF
          </button>
          <button
            onClick={handleExportWord}
            className="w-full flex items-center gap-2 px-4 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
              <path d="M16 13H8" />
              <path d="M16 17H8" />
            </svg>
            导出 Word
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Main page ─── */
export default function Page() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const { user } = useAuth();
  const lastInput = useRef("");

  // ── Report / Canvas state ──
  const [reportId, setReportId] = useState<string | null>(null);
  const report = useReport(reportId);
  const creatingReport = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  // ── Section edit + version history hooks ──
  const getSections = useCallback(() => report.sections, [report.sections]);
  const sectionEdit = useSectionEdit(reportId, getSections, report.upsertSection);
  const versionHistory = useVersionHistory(reportId, report.replaceAllSections);
  const [versionPanelOpen, setVersionPanelOpen] = useState(false);

  // Build available spaces list (always include demo space for preset docs)
  const availableSpaces = useMemo(() => {
    const demo = { spaceId: DEMO_SPACE_ID, spaceName: "预置文档" };
    if (user) {
      const userSpaces = user.spaces.map((s) => ({
        spaceId: s.spaceId,
        spaceName: s.spaceName,
      }));
      // Avoid duplicate if user already belongs to demo space
      const hasDemoSpace = userSpaces.some((s) => s.spaceId === DEMO_SPACE_ID);
      return hasDemoSpace ? userSpaces : [demo, ...userSpaces];
    }
    return [demo];
  }, [user]);

  // Default: all spaces selected
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<Set<string>>(
    () => new Set(availableSpaces.map((s) => s.spaceId))
  );

  // Keep selection in sync when spaces change (e.g. after login)
  useEffect(() => {
    setSelectedSpaceIds(new Set(availableSpaces.map((s) => s.spaceId)));
  }, [availableSpaces]);

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
    body: {
      spaceIds: [...selectedSpaceIds],
      reportId,
    },
    onError: () => {
      setInput(lastInput.current);
    },
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const turns = useMemo(() => groupTurns(messages), [messages]);

  // ── Sync write_report_section tool results into Canvas ──
  useEffect(() => {
    const sectionResults: ReportSection[] = [];
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const tool of ((m as any).toolInvocations ?? []) as any[]) {
        if (
          tool.toolName === "write_report_section" &&
          tool.state === "result" &&
          !tool.result?.error
        ) {
          sectionResults.push(tool.result as ReportSection);
        }
      }
    }
    for (const s of sectionResults) {
      report.upsertSection(s);
    }

    // Auto-create report on first write_report_section result
    if (sectionResults.length > 0 && !reportId && !creatingReport.current) {
      creatingReport.current = true;
      fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "AI 生成报告", spaceId: [...selectedSpaceIds][0] }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.id) setReportId(data.id);
        })
        .catch(() => {})
        .finally(() => {
          creatingReport.current = false;
        });
    }
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasCanvas = report.sections.length > 0;

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
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            {SIDEBAR_HINT}
          </p>
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
        <div className="p-3 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-center">
            <NavAuth />
          </div>
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
          <button
            onClick={() => {
              userScrolledUp.current = false;
              append({ role: "user", content: "帮我生成一份数据分析报告" });
              setSidebarOpen(false);
            }}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
              <path d="M16 13H8" />
              <path d="M16 17H8" />
              <path d="M10 9H8" />
            </svg>
            生成报告
          </button>
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
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-700">
              {hasCanvas ? report.title : "AI 智能问答"}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5 hidden sm:block">
              {hasCanvas
                ? "报告生成中 · 在左侧对话中继续修改"
                : "搜索知识库 · 分析数据报表 · 自动生成图表"}
            </p>
          </div>
          {hasCanvas && (
            <>
            <button
              onClick={() => report.save()}
              disabled={report.saving || !reportId}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              {report.saving ? "保存中..." : "保存报告"}
            </button>
            <div className="relative">
              <button
                onClick={() => {
                  setVersionPanelOpen(!versionPanelOpen);
                  if (!versionPanelOpen) versionHistory.fetchVersions();
                }}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                title="版本历史"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                版本
              </button>
              {versionPanelOpen && (
                <VersionHistoryPanel
                  versions={versionHistory.versions}
                  loading={versionHistory.loading}
                  restoring={versionHistory.restoring}
                  onRestore={(versionId) => {
                    versionHistory.restoreVersion(versionId);
                  }}
                  onClose={() => setVersionPanelOpen(false)}
                />
              )}
            </div>
            <ExportDropdown
              canvasRef={canvasRef}
              title={report.title}
              sections={report.sections}
            />
          </>
          )}
          <SpacePicker
            spaces={availableSpaces}
            selected={selectedSpaceIds}
            onChange={setSelectedSpaceIds}
          />
        </header>

        <div className={`flex-1 flex min-h-0 ${hasCanvas ? "flex-row" : "flex-col"}`}>
          {/* ── Chat area ── */}
          <div className={`flex flex-col min-h-0 ${hasCanvas ? "w-[40%] border-r border-slate-200" : "flex-1"}`}>
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
                    <button
                      onClick={() => setUploadOpen(true)}
                      className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 text-xs font-medium text-white bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-xl hover:from-indigo-600 hover:to-cyan-600 shadow-sm hover:shadow-md transition-all"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" x2="12" y1="3" y2="15" />
                      </svg>
                      上传文件到知识库
                    </button>
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
                className="flex gap-2 md:gap-3 max-w-3xl mx-auto items-center"
              >
                <button
                  type="button"
                  onClick={() => setUploadOpen(true)}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium text-indigo-500 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 hover:border-indigo-200 transition-colors"
                  title="上传文件到知识库"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" x2="12" y1="3" y2="15" />
                  </svg>
                  <span className="hidden sm:inline">上传文件到知识库</span>
                </button>
                <input
                  value={input}
                  onChange={handleInputChange}
                  placeholder="输入你想问的问题..."
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
          </div>

          {/* ── Canvas area (right panel) ── */}
          {hasCanvas && (
            <div className="w-[60%] flex flex-col min-h-0">
              <ReportCanvas
                ref={canvasRef}
                sections={report.sections}
                title={report.title}
                isStreaming={isLoading}
                onEditSection={sectionEdit.editSection}
                editingSectionId={sectionEdit.editingSectionId}
                editProgress={sectionEdit.editProgress}
              />
            </div>
          )}
        </div>
      </main>

      {uploadOpen && (
        <ChatUploadModal
          spaces={availableSpaces.filter((s) => s.spaceId !== DEMO_SPACE_ID)}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {}}
        />
      )}
    </div>
  );
}
