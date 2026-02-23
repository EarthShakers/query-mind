"use client";

import { ChartResult } from "@/components/chart-result";
import { SqlResult } from "@/components/sql-result";
import type { ReportSection } from "@/lib/report-types";

export function ReportSectionRenderer({
  section,
}: {
  section: ReportSection;
}) {
  return (
    <div className="mb-8">
      {section.title && (
        <h2 className="text-lg font-semibold text-slate-700 mb-3">
          {section.title}
        </h2>
      )}

      {section.content_type === "markdown" && section.content_markdown && (
        <div className="prose prose-slate prose-sm max-w-none">
          {section.content_markdown.split("\n").map((line, i) => {
            if (!line.trim()) return <br key={i} />;
            // Skip markdown headings that duplicate the section title
            if (section.title) {
              const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
              if (headingMatch && headingMatch[1].trim() === section.title.trim()) {
                return null;
              }
            }
            if (line.startsWith("### "))
              return (
                <h4
                  key={i}
                  className="text-sm font-semibold text-slate-600 mt-4 mb-2"
                >
                  {line.slice(4)}
                </h4>
              );
            if (line.startsWith("## "))
              return (
                <h3
                  key={i}
                  className="text-base font-semibold text-slate-700 mt-4 mb-2"
                >
                  {line.slice(3)}
                </h3>
              );
            if (line.startsWith("- "))
              return (
                <li key={i} className="text-sm text-slate-600 ml-4">
                  {line.slice(2)}
                </li>
              );
            return (
              <p
                key={i}
                className="text-sm text-slate-700 leading-relaxed mb-2"
              >
                {line}
              </p>
            );
          })}
        </div>
      )}

      {section.content_type === "chart" && section.chart_config && (
        <ChartResult
          data={section.chart_config.data}
          chartType={section.chart_config.chartType}
          xKey={section.chart_config.xKey}
          yKey={section.chart_config.yKey}
          groupKey={section.chart_config.groupKey}
        />
      )}

      {section.content_type === "table" && section.table_data && (
        <SqlResult data={section.table_data.data} />
      )}

      {section.error && (
        <p className="text-sm text-red-500 mt-2">{section.error}</p>
      )}
    </div>
  );
}
