"use client";

import { forwardRef, useState } from "react";
import { ReportSectionRenderer } from "@/components/report-section-renderer";
import { SectionEditPopover } from "@/components/section-edit-popover";
import type { ReportSection } from "@/lib/report-types";
import type { EditStep } from "@/hooks/use-section-edit";

function SmallSpinner() {
  return (
    <span className="inline-block w-3.5 h-3.5 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
  );
}

const STEP_LABELS: Record<EditStep, string> = {
  plan: "分析修改意图...",
  query: "查询数据...",
  analyze: "生成修改方案...",
  write: "写入新内容...",
};

export const ReportCanvas = forwardRef<
  HTMLDivElement,
  {
    sections: ReportSection[];
    title: string;
    isStreaming: boolean;
    onEditSection?: (sectionId: string, instruction: string) => void;
    editingSectionId?: string | null;
    editProgress?: { step: EditStep; needsQuery?: boolean } | null;
  }
>(function ReportCanvas(
  { sections, title, isStreaming, onEditSection, editingSectionId, editProgress },
  ref
) {
  const [popoverSectionId, setPopoverSectionId] = useState<string | null>(null);

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div ref={ref} className="max-w-3xl mx-auto px-6 md:px-10 py-8 md:py-12">
        <h1 className="text-2xl font-bold text-slate-800 mb-8 pb-4 border-b border-slate-200">
          {title}
        </h1>

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
                <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-[1px] rounded-lg flex items-center justify-center">
                  <div className="flex items-center gap-2.5 px-4 py-2.5 bg-white rounded-xl shadow-lg border border-indigo-100">
                    <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
                    <span className="text-xs font-medium text-slate-600">
                      {STEP_LABELS[editProgress.step] || "处理中..."}
                    </span>
                  </div>
                </div>
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
