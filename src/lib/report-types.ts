export interface ReportSection {
  section_id: string;
  sort_order: number;
  title?: string;
  content_type: "markdown" | "chart" | "table";
  content_markdown?: string;
  chart_config?: {
    data: Record<string, unknown>[];
    chartType: "bar" | "line" | "pie";
    xKey: string;
    yKey: string;
    groupKey?: string;
  };
  table_data?: {
    data: Record<string, unknown>[];
  };
  error?: string;
}

export interface Report {
  id: string;
  space_id: string;
  title: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  sections?: ReportSection[];
}
