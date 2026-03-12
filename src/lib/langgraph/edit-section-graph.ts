import { StateGraph, Annotation, END } from "@langchain/langgraph";
import { createDashScopeLLM } from "./llm";
import { PLAN_PROMPT, ANALYZE_PROMPT, WRITE_PROMPT, REFLECT_PROMPT } from "./edit-section-prompts";
import { queryUserData } from "@/lib/data/pg";
import type { ReportSection } from "../report-types";

/* ─── State definition ─── */
const EditSectionState = Annotation.Root({
  section: Annotation<ReportSection>,
  instruction: Annotation<string>,
  tableSchemas: Annotation<string>,
  // Populated by nodes
  needsQuery: Annotation<boolean>({ reducer: (_, v) => v, default: () => false }),
  suggestedSQL: Annotation<string | null>({ reducer: (_, v) => v, default: () => null }),
  planReasoning: Annotation<string>({ reducer: (_, v) => v, default: () => "" }),
  queryResult: Annotation<string>({ reducer: (_, v) => v, default: () => "" }),
  analysis: Annotation<string>({ reducer: (_, v) => v, default: () => "" }),
  updatedSection: Annotation<ReportSection | null>({ reducer: (_, v) => v, default: () => null }),
  currentStep: Annotation<string>({ reducer: (_, v) => v, default: () => "" }),
  error: Annotation<string | null>({ reducer: (_, v) => v, default: () => null }),
  retries: Annotation<number>({ reducer: (_, v) => v, default: () => 0 }),
  validationErrors: Annotation<string[]>({ reducer: (_, v) => v, default: () => [] }),
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
      planReasoning: parsed.reasoning || "",
      currentStep: "plan",
    };
  } catch {
    return { needsQuery: false, suggestedSQL: null, planReasoning: "", currentStep: "plan" };
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

/* ─── Node: validate ─── */
function validateNode(state: typeof EditSectionState.State) {
  const errors: string[] = [];
  const section = state.updatedSection;
  const original = state.section;

  if (!section) {
    errors.push("updatedSection is null — LLM failed to produce output");
    return { validationErrors: errors, currentStep: "validate" };
  }

  // Check section_id and sort_order match original
  if (section.section_id !== original.section_id) {
    errors.push(`section_id mismatch: expected "${original.section_id}", got "${section.section_id}"`);
  }
  if (section.sort_order !== original.sort_order) {
    errors.push(`sort_order mismatch: expected ${original.sort_order}, got ${section.sort_order}`);
  }

  // Type-specific validations
  if (section.content_type === "markdown") {
    if (!section.content_markdown || section.content_markdown.length <= 10) {
      errors.push("markdown section has empty or too-short content_markdown (must be > 10 chars)");
    }
  }

  if (section.content_type === "chart") {
    const cfg = section.chart_config;
    if (!cfg) {
      errors.push("chart section missing chart_config");
    } else {
      if (!Array.isArray(cfg.data) || cfg.data.length === 0) {
        errors.push("chart_config.data must be a non-empty array");
      }
      const validChartTypes = ["bar", "line", "pie"];
      if (!validChartTypes.includes(cfg.chartType)) {
        errors.push(`chart_config.chartType "${cfg.chartType}" is not valid (must be bar|line|pie)`);
      }
      if (!cfg.xKey) {
        errors.push("chart_config.xKey is missing or empty");
      }
      if (!cfg.yKey) {
        errors.push("chart_config.yKey is missing or empty");
      }
      // Check keys exist in data
      if (Array.isArray(cfg.data) && cfg.data.length > 0) {
        const keys = Object.keys(cfg.data[0] as Record<string, unknown>);
        if (cfg.xKey && !keys.includes(cfg.xKey)) {
          errors.push(`chart_config.xKey "${cfg.xKey}" not found in data columns: [${keys.join(", ")}]`);
        }
        if (cfg.yKey && !keys.includes(cfg.yKey)) {
          errors.push(`chart_config.yKey "${cfg.yKey}" not found in data columns: [${keys.join(", ")}]`);
        }
      }
    }
  }

  if (section.content_type === "table") {
    if (!section.table_data || !Array.isArray(section.table_data.data) || section.table_data.data.length === 0) {
      errors.push("table section has empty or missing table_data.data");
    }
  }

  return { validationErrors: errors, currentStep: "validate" };
}

/* ─── Node: reflect ─── */
async function reflectNode(state: typeof EditSectionState.State) {
  const llm = createDashScopeLLM();
  const prompt = REFLECT_PROMPT
    .replace("{section_json}", JSON.stringify(state.section, null, 2))
    .replace("{instruction}", state.instruction)
    .replace("{previous_output}", JSON.stringify(state.updatedSection, null, 2))
    .replace("{validation_errors}", state.validationErrors.map((e, i) => `${i + 1}. ${e}`).join("\n"))
    .replace("{section_id}", state.section.section_id)
    .replace("{sort_order}", String(state.section.sort_order));

  const response = await llm.invoke([{ role: "user", content: prompt }]);
  const text = typeof response.content === "string" ? response.content : "";

  const newData = parseQueryData(state.queryResult);

  try {
    const parsed = JSON.parse(
      text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    );
    const section = buildSafeSection(parsed, state.section, newData);
    return {
      updatedSection: section,
      retries: state.retries + 1,
      currentStep: "reflect",
    };
  } catch {
    return {
      retries: state.retries + 1,
      currentStep: "reflect",
      error: "Failed to parse reflect LLM response",
    };
  }
}

/* ─── Conditional edge: after validate ─── */
function routeAfterValidate(state: typeof EditSectionState.State): string {
  if (state.validationErrors.length === 0) return "__end__";
  if (state.retries >= 2) return "__end__";
  return "reflect";
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
    .addNode("validate", validateNode)
    .addNode("reflect", reflectNode)
    .addEdge("__start__", "plan")
    .addConditionalEdges("plan", routeAfterPlan, {
      query: "query",
      analyze: "analyze",
    })
    .addEdge("query", "analyze")
    .addEdge("analyze", "write")
    .addEdge("write", "validate")
    .addConditionalEdges("validate", routeAfterValidate, {
      reflect: "reflect",
      __end__: END,
    })
    .addEdge("reflect", "write");

  return graph.compile();
}
