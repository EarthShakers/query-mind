"use client";

import { forwardRef } from "react";
import { ReportSectionRenderer } from "@/components/report-section-renderer";
import type { ReportSection } from "@/lib/report-types";

function SmallSpinner() {
  return (
    <span className="inline-block w-3.5 h-3.5 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
  );
}

export const ReportCanvas = forwardRef<
  HTMLDivElement,
  {
    sections: ReportSection[];
    title: string;
    isStreaming: boolean;
  }
>(function ReportCanvas({ sections, title, isStreaming }, ref) {
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

        {sections.map((section) => (
          <ReportSectionRenderer
            key={section.section_id}
            section={section}
          />
        ))}

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
