"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { ChartResult } from "@/components/chart-result";
import { TOOL_LABELS, CHART_TYPE_LABELS } from "./constants";
import { ThinkingDetails } from "./thinking-details";
import { AgentProgress } from "./agent-progress";

const CHAT_MD_COMPONENTS: Components = {
  p: ({ node, ...props }) => <div className="mb-1 last:mb-0" {...props} />,
  img: ({ node, src, alt, ...props }) => (
    <span className="block my-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? ""}
        className="max-w-full rounded-lg border border-slate-200 shadow-sm"
        loading="lazy"
        {...props}
      />
    </span>
  ),
};

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
export function AssistantTurn({
  assistantMessages,
  userContent = "",
  spaceId,
  isStreaming,
  isAgentMode = false,
  streamData,
  onScrollNeeded,
}: {
  assistantMessages: any[];
  userContent?: string;
  /** 当前空间 ID，用于知识库预览链接 */
  spaceId?: string;
  isStreaming: boolean;
  /** 由父组件根据 deepThink 开关直接传入 */
  isAgentMode?: boolean;
  /** useChat 的 data 流，用于实时 agent 进度 */
  streamData?: any;
  onScrollNeeded: () => void;
}) {
  const [acceptedChartIds, setAcceptedChartIds] = useState<Set<string>>(
    () => new Set()
  );
  const allTools = useAllTools(assistantMessages);

  const { thinkingTexts, finalText } = useMemo(() => {
    const thinking: string[] = [];
    const seen = new Set<string>();
    let answer = "";
    for (let i = 0; i < assistantMessages.length; i++) {
      const m = assistantMessages[i];
      const text = m.content?.trim() || "";
      if (!text) continue;
      const isLastMsg = i === assistantMessages.length - 1;
      // Agent 模式：最后一个 message 的 content 是 streamText 流式输出的最终回答，不是 thinking
      if (isAgentMode && isLastMsg) {
        answer = text;
        break;
      }
      if (m.toolInvocations?.length > 0) {
        if (!seen.has(text)) {
          seen.add(text);
          thinking.push(text);
        }
      } else if (isLastMsg && isStreaming) {
        thinking.push(text);
      } else {
        answer = text;
      }
    }
    return { thinkingTexts: thinking, finalText: answer };
  }, [assistantMessages, isStreaming, isAgentMode]);

  const directCharts = useMemo(() => {
    return allTools.filter(
      (t) =>
        t.state === "result" && !t.result?.error && t.toolName === "show_chart"
    );
  }, [allTools]);

  const chartSuggestions = useMemo(() => {
    return allTools.filter(
      (t) =>
        t.state === "result" &&
        !t.result?.error &&
        t.toolName === "suggest_chart"
    );
  }, [allTools]);

  const acceptedCharts = useMemo(() => {
    return chartSuggestions.filter((t) => acceptedChartIds.has(t.toolCallId));
  }, [chartSuggestions, acceptedChartIds]);

  const hasAnswer = finalText || directCharts.length > 0;
  const hasThinkingContent = allTools.length > 0 || thinkingTexts.length > 0;

  const toolErrors = useMemo(() => {
    return allTools.filter((t) => t.state === "result" && t.result?.error);
  }, [allTools]);
  const allToolsFailed =
    !isStreaming &&
    !hasAnswer &&
    toolErrors.length > 0 &&
    allTools.every(
      (t) =>
        t.state === "result" &&
        (t.result?.error || t.toolName === "suggest_chart")
    );
  const lastErrorMsg = allToolsFailed
    ? toolErrors[toolErrors.length - 1]?.result?.error
    : "";

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
      requestAnimationFrame(() => onScrollNeeded());
    },
    [onScrollNeeded]
  );

  // 从 useChat data 中提取 agent 进度事件
  const agentProgressEvents = useMemo(() => {
    if (!streamData || !Array.isArray(streamData)) return [];
    return streamData.filter(
      (d: any) => d && typeof d === "object" && d.type === "agent_progress"
    );
  }, [streamData]);

  if (!assistantMessages.length && !isStreaming) return null;

  return (
    <>
      {/* ── Main answer bubble ── */}
      <div className="flex justify-start">
        <div className="w-full md:max-w-[90%] px-4 py-3 rounded-2xl rounded-tl-sm bg-white border border-slate-200 shadow-sm">
          {/* Thinking section */}
          {(isAgentMode || showThinking) && (
            <div className={hasAnswer ? "mb-3" : ""}>
              {isAgentMode ? (
                <AgentProgress
                  userQuery={userContent}
                  isActive={isStillThinking}
                  progressEvents={agentProgressEvents}
                  executionTools={allTools
                    .filter((t) => t.state === "result")
                    .map((t) => ({ toolName: t.toolName, result: t.result }))}
                />
              ) : isStillThinking ? (
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
              {hasThinkingContent && !isAgentMode && (
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
                    spaceId={spaceId}
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
            <div
              className={`text-sm text-slate-700 leading-relaxed prose prose-sm prose-slate max-w-none prose-p:my-0.5 prose-headings:text-slate-800${
                directCharts.length > 0 ? " mt-3" : ""
              }`}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={CHAT_MD_COMPONENTS}
              >
                {finalText}
              </ReactMarkdown>
            </div>
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
