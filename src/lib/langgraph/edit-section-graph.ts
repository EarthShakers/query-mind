import { StateGraph, Annotation, END } from "@langchain/langgraph";
import { createDashScopeLLM } from "./llm";
import { PLAN_PROMPT, ANALYZE_PROMPT, WRITE_PROMPT } from "./edit-section-prompts";
import { queryUserData } from "@/lib/pg";
import type { ReportSection } from "@/lib/report-types";

/* ─── State definition ─── */
const EditSectionState = Annotation.Root({
  section: Annotation<ReportSection>,
  instruction: Annotation<string>,
  tableSchemas: Annotation<string>,
  // Populated by nodes
  needsQuery: Annotation<boolean>({ reducer: (_, v) => v, default: () => false }),
  suggestedSQL: Annotation<string | null>({ reducer: (_, v) => v, default: () => null }),
  queryResult: Annotation<string>({ reducer: (_, v) => v, default: () => "" }),
  analysis: Annotation<string>({ reducer: (_, v) => v, default: () => "" }),
  updatedSection: Annotation<ReportSection | null>({ reducer: (_, v) => v, default: () => null }),
  currentStep: Annotation<string>({ reducer: (_, v) => v, default: () => "" }),
  error: Annotation<string | null>({ reducer: (_, v) => v, default: () => null }),
});

export type EditSectionStateType = typeof EditSectionState.State;

/* ─── Node: plan ─── */
async function planNode(state: typeof EditSectionState.State) {
  const llm = createDashScopeLLM();
  const prompt = PLAN_PROMPT
    .replace("{section_json}", JSON.stringify(state.section, null, 2))
    .replace("{table_schemas}", state.tableSchemas || "No tables available")
    .replace("{instruction}", state.instruction);

  const response = await llm.invoke([{ role: "user", content: prompt }]);
  const text = typeof response.content === "string" ? response.content : "";

  try {
    const parsed = JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    return {
      needsQuery: !!parsed.needsQuery,
      suggestedSQL: parsed.suggestedSQL || null,
      currentStep: "plan",
    };
  } catch {
    return { needsQuery: false, suggestedSQL: null, currentStep: "plan" };
  }
}

/* ─── Node: query ─── */
async function queryNode(state: typeof EditSectionState.State) {
  if (!state.suggestedSQL) {
    return { queryResult: "", currentStep: "query" };
  }
  try {
    const rows = await queryUserData(state.suggestedSQL);
    return {
      queryResult: JSON.stringify(rows, null, 2),
      currentStep: "query",
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { queryResult: `Query error: ${msg}`, currentStep: "query" };
  }
}

/* ─── Node: analyze ─── */
async function analyzeNode(state: typeof EditSectionState.State) {
  const llm = createDashScopeLLM();
  const prompt = ANALYZE_PROMPT
    .replace("{section_json}", JSON.stringify(state.section, null, 2))
    .replace("{instruction}", state.instruction)
    .replace("{query_result}", state.queryResult || "N/A");

  const response = await llm.invoke([{ role: "user", content: prompt }]);
  const text = typeof response.content === "string" ? response.content : "";

  return { analysis: text, currentStep: "analyze" };
}

/* ─── Helper: parse new query data if available ─── */
function parseQueryData(queryResult: string): Record<string, unknown>[] | null {
  if (!queryResult || queryResult.startsWith("Query error")) return null;
  try {
    const data = JSON.parse(queryResult);
    if (Array.isArray(data) && data.length > 0) return data;
  } catch { /* ignore */ }
  return null;
}

/* ─── Helper: build a safe updated section by merging LLM output with original ─── */
function buildSafeSection(
  parsed: Record<string, unknown>,
  original: ReportSection,
  newData: Record<string, unknown>[] | null,
): ReportSection {
  const result: ReportSection = {
    section_id: original.section_id,
    sort_order: original.sort_order,
    title: typeof parsed.title === "string" ? parsed.title : original.title,
    content_type: (["markdown", "chart", "table"].includes(parsed.content_type as string)
      ? parsed.content_type
      : original.content_type) as ReportSection["content_type"],
  };

  // ── markdown ──
  if (result.content_type === "markdown") {
    const md = parsed.content_markdown ?? (parsed as any).markdown;
    result.content_markdown =
      typeof md === "string" && md.length > 0
        ? md
        : original.content_markdown ?? "";
  }

  // ── chart ──
  if (result.content_type === "chart") {
    const llmChart = (parsed.chart_config ?? {}) as Record<string, unknown>;
    const origChart = original.chart_config;

    result.chart_config = {
      data: newData ?? (origChart?.data ?? []),
      chartType:
        (["bar", "line", "pie"].includes(llmChart.chartType as string)
          ? llmChart.chartType
          : origChart?.chartType ?? "bar") as "bar" | "line" | "pie",
      xKey:
        (typeof llmChart.xKey === "string" && llmChart.xKey) ||
        origChart?.xKey ||
        "",
      yKey:
        (typeof llmChart.yKey === "string" && llmChart.yKey) ||
        origChart?.yKey ||
        "",
      groupKey:
        typeof llmChart.groupKey === "string"
          ? llmChart.groupKey
          : origChart?.groupKey,
    };
  }

  // ── table ──
  if (result.content_type === "table") {
    result.table_data = {
      data: newData ?? (original.table_data?.data ?? []),
    };
  }

  return result;
}

/* ─── Node: write ─── */
async function writeNode(state: typeof EditSectionState.State) {
  const llm = createDashScopeLLM();
  const original = state.section;

  // Strip large data arrays from prompt to save tokens and avoid confusion
  const sectionForPrompt = { ...original } as Record<string, unknown>;
  if (original.chart_config) {
    sectionForPrompt.chart_config = {
      chartType: original.chart_config.chartType,
      xKey: original.chart_config.xKey,
      yKey: original.chart_config.yKey,
      groupKey: original.chart_config.groupKey,
      data: `[${original.chart_config.data.length} rows, first: ${JSON.stringify(original.chart_config.data[0] ?? {})}]`,
    };
  }
  if (original.table_data) {
    sectionForPrompt.table_data = {
      data: `[${original.table_data.data.length} rows, first: ${JSON.stringify(original.table_data.data[0] ?? {})}]`,
    };
  }

  const prompt = WRITE_PROMPT
    .replace("{section_json}", JSON.stringify(sectionForPrompt, null, 2))
    .replace("{instruction}", state.instruction)
    .replace("{analysis}", state.analysis)
    .replace("{query_result}", state.queryResult || "N/A");

  const response = await llm.invoke([{ role: "user", content: prompt }]);
  const text = typeof response.content === "string" ? response.content : "";

  const newData = parseQueryData(state.queryResult);

  try {
    const parsed = JSON.parse(
      text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    );
    const section = buildSafeSection(parsed, original, newData);
    return { updatedSection: section, currentStep: "write" };
  } catch {
    // JSON parse failed — if it's a markdown section, try to use the raw LLM text as content
    if (original.content_type === "markdown" && text.length > 20) {
      return {
        updatedSection: {
          ...original,
          content_markdown: text,
        },
        currentStep: "write",
      };
    }
    return {
      updatedSection: null,
      error: "Failed to parse LLM response as valid section JSON",
      currentStep: "write",
    };
  }
}

/* ─── Conditional edge: after plan ─── */
function routeAfterPlan(state: typeof EditSectionState.State): string {
  return state.needsQuery ? "query" : "analyze";
}

/* ─── Build graph ─── */
export function buildEditSectionGraph() {
  const graph = new StateGraph(EditSectionState)
    .addNode("plan", planNode)
    .addNode("query", queryNode)
    .addNode("analyze", analyzeNode)
    .addNode("write", writeNode)
    .addEdge("__start__", "plan")
    .addConditionalEdges("plan", routeAfterPlan, {
      query: "query",
      analyze: "analyze",
    })
    .addEdge("query", "analyze")
    .addEdge("analyze", "write")
    .addEdge("write", END);

  return graph.compile();
}
