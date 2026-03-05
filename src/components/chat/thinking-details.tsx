"use client";

import { SqlResult } from "@/components/sql-result";
import { TOOL_LABELS } from "./constants";

export function SmallSpinner() {
  return (
    <span className="inline-block w-3 h-3 border-[1.5px] border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
  );
}

export function ThinkingDetails({
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
                  {results.map((doc: { title: string; content: string; similarity: number; summary?: string }, i: number) => (
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
                      {doc.summary && (
                        <p className="text-[10px] text-indigo-600/80 leading-relaxed mb-1">
                          摘要：{doc.summary}
                        </p>
                      )}
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
