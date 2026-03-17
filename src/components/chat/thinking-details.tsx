"use client";

import { useState } from "react";
import Link from "next/link";
import { SqlResult } from "@/components/sql-result";
import { SimilarityBadge } from "./similarity-badge";
import { TOOL_LABELS } from "./constants";

export function SmallSpinner() {
  return (
    <span className="inline-block w-3 h-3 border-[1.5px] border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
  );
}

/** 单个知识库片段的预览弹窗 */
function ChunkPreviewModal({
  title,
  content,
  onClose,
}: {
  title: string;
  content: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-w-2xl w-full max-h-[80vh] overflow-hidden rounded-xl bg-white shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <span className="font-medium text-slate-700 truncate">{title}</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      </div>
    </div>
  );
}

export function ThinkingDetails({
  allTools,
  intermediateTexts,
  spaceId,
  isInterrupted,
}: {
  allTools: any[];
  intermediateTexts: string[];
  /** 空间 ID，用于预览知识库文档 */
  spaceId?: string;
  /** 用户已打断，不显示进行中的 loading */
  isInterrupted?: boolean;
}) {
  const [previewChunk, setPreviewChunk] = useState<{ title: string; content: string } | null>(null);
  return (
    <div className="mt-1.5 ml-6 max-h-[40vh] overflow-y-auto space-y-2 border-l-2 border-slate-100 pl-3 text-xs text-slate-400">
      {intermediateTexts.map((text, i) => (
        <p key={`text-${i}`} className="leading-relaxed">
          {text}
        </p>
      ))}
      {allTools.map((tool) => {
        if (tool.state !== "result") {
          if (isInterrupted) return null;
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
        if (tool.toolName === "think") {
          const r = tool.result as {
            reasoning?: string;
            planned_tools?: string[];
            complexity?: string;
          };
          return (
            <div key={tool.toolCallId} className="py-0.5 space-y-1">
              <span className="text-slate-500 font-medium">
                {TOOL_LABELS[tool.toolName]}
              </span>
              {r?.reasoning && (
                <p className="text-slate-400 leading-relaxed">{r.reasoning}</p>
              )}
              {r?.planned_tools && r.planned_tools.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {r.planned_tools.map((t, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[10px]"
                    >
                      {i + 1}. {TOOL_LABELS[t] || t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        }
        if (tool.toolName === "validate_answer") {
          const v = tool.result as {
            complete?: boolean;
            missing?: string[];
          };
          return (
            <div key={tool.toolCallId} className="py-0.5">
              <span className="text-slate-500">
                {TOOL_LABELS[tool.toolName]}
              </span>
              <span className="ml-1">
                {v?.complete ? (
                  <span className="text-emerald-400">✅ 验证通过</span>
                ) : (
                  <span className="text-amber-500">
                    ⚠️ 部分未解答
                    {v?.missing?.length ? ` (${v.missing.join("、")})` : ""}
                  </span>
                )}
              </span>
            </div>
          );
        }
        if (tool.toolName === "search_knowledge") {
          const results = tool.result.results ?? [];
          const pipeline = tool.result.pipeline as
            | {
                usedSelfQuery?: boolean;
                usedRerank?: boolean;
                usedMultiQuery?: boolean;
                action?: string;
                initialCount?: number;
                finalCount?: number;
              }
            | undefined;
          return (
            <div key={tool.toolCallId} className="py-0.5">
              <span className="text-slate-500">
                搜索知识库：{tool.result.query}
              </span>
              <span className="text-slate-300 ml-1">
                — 找到 {results.length} 个相关片段
              </span>
              {pipeline && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <span className="text-[10px] text-slate-400">检索策略：</span>
                  {pipeline.usedSelfQuery && (
                    <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 text-[10px]">
                      Self-Query
                    </span>
                  )}
                  {pipeline.usedRerank && (
                    <span className="px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-600 text-[10px]">
                      Rerank
                    </span>
                  )}
                  {pipeline.usedMultiQuery && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-600 text-[10px]">
                      Multi-Query
                    </span>
                  )}
                  {pipeline.action === "top10" &&
                    !pipeline.usedRerank &&
                    !pipeline.usedMultiQuery && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
                        Top10
                      </span>
                    )}
                  {pipeline.initialCount != null && pipeline.finalCount != null && (
                    <span className="text-[10px] text-slate-400">
                      ({pipeline.initialCount}→{pipeline.finalCount})
                    </span>
                  )}
                </div>
              )}
              {results.length > 0 && (
                <div className="mt-1 space-y-1">
                  {results.map((doc: { title?: string; content: string; similarity: number; summary?: string; metadata?: { title?: string } }, i: number) => {
                    const fileTitle = doc.title ?? doc.metadata?.title ?? "未知文件";
                    return (
                      <div
                        key={i}
                        className="p-2 bg-slate-50 rounded border border-slate-100"
                      >
                        <div className="flex items-center justify-between mb-0.5 gap-2">
                          <span className="font-medium text-slate-500 truncate min-w-0" title={fileTitle}>
                            📄 {fileTitle}
                          </span>
                          <SimilarityBadge
                            pct={Math.round((doc.similarity ?? 0) * 100)}
                            variant="light"
                            scoreType={pipeline?.usedRerank ? "rerank" : "embedding"}
                          />
                        </div>
                        {doc.summary && (
                          <p className="text-[10px] text-indigo-600/80 leading-relaxed mb-1">
                            摘要：{doc.summary}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-3">
                          {doc.content}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewChunk({ title: fileTitle, content: doc.content })}
                            className="text-[10px] text-indigo-500 hover:text-indigo-600 hover:underline"
                          >
                            预览片段
                          </button>
                          <Link
                            href={spaceId ? `/knowledge?spaceId=${encodeURIComponent(spaceId)}` : "/knowledge"}
                            className="text-[10px] text-indigo-500 hover:text-indigo-600 hover:underline"
                          >
                            知识库
                          </Link>
                        </div>
                      </div>
                    );
                  })}
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
      {previewChunk && (
        <ChunkPreviewModal
          title={previewChunk.title}
          content={previewChunk.content}
          onClose={() => setPreviewChunk(null)}
        />
      )}
    </div>
  );
}
