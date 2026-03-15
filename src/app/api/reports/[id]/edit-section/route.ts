import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { buildEditSectionGraph } from "@/lib/langgraph/edit-section-graph";
import { getUserTableSchemas, formatUserSchemas } from "@/lib/data/excel-parser";
import type { ReportSection } from "@/lib/report-types";
import { getModelConfig, runWithConfigAsync } from "@/lib/llm/model-config";

export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reportId } = await params;
  const { sectionId, instruction, section: clientSection, allSections: clientAllSections } = await req.json();

  if (!sectionId || !instruction) {
    return Response.json(
      { error: "缺少 sectionId 或 instruction" },
      { status: 400 }
    );
  }

  // Use client-provided section if available (report may not be saved to DB yet)
  let targetSection: ReportSection | undefined;
  let sections: any[];

  if (clientSection) {
    targetSection = clientSection as ReportSection;
    sections = clientAllSections ?? [clientSection];
  } else {
    // Fallback: load from DB
    const { data: dbSections, error: secErr } = await supabase
      .from("report_sections")
      .select(
        "section_id, sort_order, title, content_type, content_markdown, chart_config, table_data"
      )
      .eq("report_id", reportId)
      .order("sort_order");

    if (secErr || !dbSections) {
      return Response.json({ error: "无法加载报告章节" }, { status: 500 });
    }

    sections = dbSections;
    targetSection = dbSections.find(
      (s: any) => s.section_id === sectionId
    ) as ReportSection | undefined;
  }

  if (!targetSection) {
    return Response.json({ error: "章节不存在" }, { status: 404 });
  }

  // Get report's space_id for table schemas
  const { data: report } = await supabase
    .from("reports")
    .select("space_id")
    .eq("id", reportId)
    .single();

  let tableSchemas = "";
  if (report?.space_id) {
    try {
      const schemas = await getUserTableSchemas([report.space_id]);
      tableSchemas = formatUserSchemas(schemas);
    } catch {
      // No user tables available
    }
  }

  // Create version snapshot BEFORE editing
  const { data: lastVersion } = await supabase
    .from("report_versions")
    .select("version_num")
    .eq("report_id", reportId)
    .order("version_num", { ascending: false })
    .limit(1)
    .single();

  const nextVersionNum = (lastVersion?.version_num ?? 0) + 1;

  await supabase.from("report_versions").insert({
    report_id: reportId,
    version_num: nextVersionNum,
    sections_snapshot: sections,
    edited_section_id: sectionId,
    edit_instruction: instruction,
  });

  // Build and stream the LangGraph（在配置上下文中执行，确保 getModelAgent 等生效）
  const config = await getModelConfig();
  const graph = buildEditSectionGraph();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      await runWithConfigAsync(config, async () => {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        const streamResult = await graph.stream(
          {
            section: targetSection,
            instruction,
            tableSchemas,
          },
          { streamMode: "updates" }
        );

        let lastValidationErrors: string[] = [];
        let lastSectionSent: unknown = null;

        for await (const chunk of streamResult) {
          // chunk is { nodeName: nodeOutput }
          for (const [nodeName, nodeOutput] of Object.entries(chunk)) {
            const output = nodeOutput as Record<string, unknown>;

            // Build detailed step event with reasoning content
            const stepData: Record<string, unknown> = {
              step: nodeName,
              currentStep: output.currentStep || nodeName,
              needsQuery: output.needsQuery,
            };

            // Include reasoning/detail from each node
            if (nodeName === "plan" && output.planReasoning) {
              stepData.reasoning = output.planReasoning;
              stepData.suggestedSQL = output.suggestedSQL;
            }
            if (nodeName === "query" && output.queryResult) {
              const qr = output.queryResult as string;
              stepData.queryResult = qr.startsWith("Query error") ? qr : undefined;
              // Send row count for successful queries
              if (!qr.startsWith("Query error")) {
                try {
                  const rows = JSON.parse(qr);
                  stepData.queryRowCount = Array.isArray(rows) ? rows.length : 0;
                } catch {}
              }
            }
            if (nodeName === "analyze" && output.analysis) {
              // Parse analysis plan text
              try {
                const parsed = JSON.parse(
                  (output.analysis as string).replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
                );
                stepData.analysisPlan = parsed.plan;
                stepData.newContentType = parsed.newContentType;
              } catch {
                stepData.analysisPlan = output.analysis;
              }
            }
            if (nodeName === "validate") {
              const errors = (output.validationErrors as string[]) ?? [];
              stepData.validationErrors = errors;
              stepData.passed = errors.length === 0;
              lastValidationErrors = errors;
            }
            if (nodeName === "reflect") {
              stepData.retries = output.retries;
            }

            send("step", stepData);

            // If write node completed, send the updated section
            if (nodeName === "write" && output.updatedSection) {
              lastSectionSent = output.updatedSection;
              send("section", output.updatedSection);
            }
            if (nodeName === "write" && output.error) {
              send("error", { message: output.error });
            }

            // If reflect produced a corrected section, send it
            if (nodeName === "reflect" && output.updatedSection) {
              lastSectionSent = output.updatedSection;
              send("section", output.updatedSection);
            }

            // Track validation state
            if (nodeName === "validate") {
              lastValidationErrors = (output.validationErrors as string[]) ?? [];
            }
          }
        }

        // If stream ended with unresolved validation errors (retries exhausted),
        // send the original section back so the UI doesn't show broken content
        if (lastValidationErrors.length > 0) {
          send("section", targetSection);
          send("error", {
            message: `编辑校验失败（已重试），已恢复原内容。问题: ${lastValidationErrors.join("; ")}`,
          });
        }

        // Persist the updated section to database
        // We need to get the final state - the last write node output has it
        // The section was already sent via SSE, let the client handle persistence
        send("done", { versionNum: nextVersionNum });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        send("error", { message: msg });
      } finally {
        controller.close();
      }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
