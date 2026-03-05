"use client";

import type { DocResult } from "@/lib/rag";

export function KnowledgeResult({
  query,
  results,
}: {
  query: string;
  results: DocResult[];
}) {
  if (!results.length) {
    return (
      <p className="text-sm text-slate-400 py-2">
        未找到相关文档
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <details className="group">
        <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 select-none">
          参考文档 ({results.length}) ▸
        </summary>
        <div className="mt-2 space-y-2">
          {results.map((doc, i) => (
            <div
              key={i}
              className="p-3 bg-indigo-50/60 rounded-lg border border-indigo-100"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-indigo-700">
                  {doc.title}
                </span>
                <span className="text-[10px] text-indigo-400">
                  {Math.round(doc.similarity * 100)}% 相关
                </span>
              </div>
              {doc.summary && (
                <p className="text-[11px] text-indigo-600/90 leading-relaxed mb-1.5">
                  摘要：{doc.summary}
                </p>
              )}
              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                {doc.content}
              </p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
