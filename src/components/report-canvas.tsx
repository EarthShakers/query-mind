"use client";

import { forwardRef, useState } from "react";
import { ReportSectionRenderer } from "@/components/report-section-renderer";
import { SectionEditPopover } from "@/components/section-edit-popover";
import type { ReportSection } from "@/lib/report-types";
import type { EditStep, StepLog } from "@/hooks/use-section-edit";

function SmallSpinner() {
  return (
    <span className="inline-block w-3.5 h-3.5 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
  );
}

const STEP_LABELS: Record<EditStep, string> = {
  plan: "分析修改意图",
  query: "查询数据",
  analyze: "生成修改方案",
  write: "写入新内容",
  validate: "校验输出",
  reflect: "修正问题",
};

const STEP_ICONS: Record<EditStep, string> = {
  plan: "🧠",
  query: "🔍",
  analyze: "📋",
  write: "✏️",
  validate: "✅",
  reflect: "🔄",
};

function EditProgressPanel({ logs, currentStep }: { logs: StepLog[]; currentStep: EditStep }) {
  return (
    <div className="absolute inset-0 z-10 bg-white/90 backdrop-blur-sm rounded-lg overflow-y-auto">
      <div className="px-4 py-3 space-y-2">
        {/* Header with current step spinner */}
        <div className="flex items-center gap-2.5 px-3 py-2 bg-indigo-50 rounded-xl border border-indigo-100">
          <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin shrink-0" />
          <span className="text-xs font-medium text-indigo-700">
            {STEP_LABELS[currentStep] || "处理中"}...
          </span>
        </div>

        {/* Step logs */}
        <div className="space-y-1.5">
          {logs.map((log, i) => (
            <div key={i} className="text-xs">
              <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                <span>{STEP_ICONS[log.step] || "⚙️"}</span>
                <span>{STEP_LABELS[log.step]}</span>
                {log.step === "validate" && (
                  <span className={log.passed ? "text-green-500" : "text-amber-500"}>
                    {log.passed ? "— 通过" : "— 发现问题"}
                  </span>
                )}
              </div>

              {/* Plan reasoning */}
              {log.reasoning && (
                <p className="ml-5 mt-0.5 text-slate-500 leading-relaxed">{log.reasoning}</p>
              )}

              {/* SQL query */}
              {log.suggestedSQL && (
                <pre className="ml-5 mt-1 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-600 overflow-x-auto font-mono">
                  {log.suggestedSQL}
                </pre>
              )}

              {/* Query result info */}
              {log.queryRowCount !== undefined && (
                <p className="ml-5 mt-0.5 text-slate-400">查询到 {log.queryRowCount} 条数据</p>
              )}
              {log.queryResult && (
                <p className="ml-5 mt-0.5 text-amber-500">{log.queryResult}</p>
              )}

              {/* Analysis plan */}
              {log.analysisPlan && (
                <p className="ml-5 mt-0.5 text-slate-500 leading-relaxed">{log.analysisPlan}</p>
              )}

              {/* Validation errors */}
              {log.validationErrors && log.validationErrors.length > 0 && (
                <ul className="ml-5 mt-0.5 space-y-0.5">
                  {log.validationErrors.map((err, j) => (
                    <li key={j} className="text-amber-600 flex items-start gap-1">
                      <span className="shrink-0">⚠</span>
                      <span>{err}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Reflect retry info */}
              {log.step === "reflect" && log.retries !== undefined && (
                <p className="ml-5 mt-0.5 text-slate-400">第 {log.retries} 次修正</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const ReportCanvas = forwardRef<
  HTMLDivElement,
  {
    sections: ReportSection[];
    title: string;
    isStreaming: boolean;
    onEditSection?: (sectionId: string, instruction: string) => void;
    editingSectionId?: string | null;
    editProgress?: { step: EditStep; needsQuery?: boolean; logs: StepLog[] } | null;
    onTitleChange?: (title: string) => void;
    onClose?: () => void;
  }
>(function ReportCanvas(
  { sections, title, isStreaming, onEditSection, editingSectionId, editProgress, onTitleChange, onClose },
  ref
) {
  const [popoverSectionId, setPopoverSectionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);

  const commitTitle = () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== title) {
      onTitleChange?.(trimmed);
    } else {
      setTitleDraft(title);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      {/* Close button */}
      {onClose && (
        <div className="sticky top-0 z-10 flex justify-end px-4 pt-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="关闭面板"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      )}
      <div ref={ref} className="max-w-3xl mx-auto px-6 md:px-10 py-8 md:py-12">
        {/* Editable title */}
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") {
                setTitleDraft(title);
                setEditingTitle(false);
              }
            }}
            className="w-full text-2xl font-bold text-slate-800 mb-8 pb-4 border-b border-indigo-300 bg-transparent outline-none focus:border-indigo-500"
          />
        ) : (
          <h1
            onClick={() => {
              if (onTitleChange) {
                setTitleDraft(title);
                setEditingTitle(true);
              }
            }}
            className={`text-2xl font-bold text-slate-800 mb-8 pb-4 border-b border-slate-200 group ${
              onTitleChange ? "cursor-pointer hover:border-indigo-300" : ""
            }`}
          >
            {title}
            {onTitleChange && (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="inline-block ml-2 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
            )}
          </h1>
        )}

        {sections.length === 0 && !isStreaming && (
          <div className="text-center text-slate-300 py-20">
            <div className="text-4xl mb-4">📄</div>
            <p className="text-sm">在左侧对话中描述你想要的报告内容</p>
            <p className="text-xs mt-2 text-slate-300">
              例如：帮我生成一份销售数据分析报告
            </p>
          </div>
        )}

        {sections.map((section) => {
          const isEditingThis = editingSectionId === section.section_id;
          const showPopover = popoverSectionId === section.section_id;

          return (
            <div key={section.section_id} className="group relative">
              {/* Hover edit button */}
              {onEditSection && !isStreaming && !isEditingThis && (
                <button
                  onClick={() =>
                    setPopoverSectionId(
                      showPopover ? null : section.section_id
                    )
                  }
                  className="absolute -right-2 top-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-indigo-50 hover:border-indigo-200"
                  title="AI 编辑此章节"
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
                    className="text-slate-500"
                  >
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
              )}

              {/* Edit popover */}
              {showPopover && onEditSection && (
                <SectionEditPopover
                  sectionId={section.section_id}
                  onSubmit={(instruction) =>
                    onEditSection(section.section_id, instruction)
                  }
                  onClose={() => setPopoverSectionId(null)}
                />
              )}

              {/* Progress overlay when editing */}
              {isEditingThis && editProgress && (
                <EditProgressPanel logs={editProgress.logs} currentStep={editProgress.step} />
              )}

              <ReportSectionRenderer section={section} />
            </div>
          );
        })}

        {isStreaming && (
          <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
            <SmallSpinner />
            <span>正在生成报告...</span>
          </div>
        )}
      </div>
    </div>
  );
});
