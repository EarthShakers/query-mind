import { supabase } from "@/lib/supabase";
import type { ReportSection } from "@/lib/report-types";

/** POST /api/reports/[id]/versions/[versionId]/restore — restore to a version */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id: reportId, versionId } = await params;

  // Load the version snapshot
  const { data: version, error: vErr } = await supabase
    .from("report_versions")
    .select("sections_snapshot, version_num")
    .eq("id", versionId)
    .eq("report_id", reportId)
    .single();

  if (vErr || !version) {
    return Response.json({ error: "版本不存在" }, { status: 404 });
  }

  const sections = version.sections_snapshot as ReportSection[];

  // Create a new version snapshot of current state before restoring
  const { data: currentSections } = await supabase
    .from("report_sections")
    .select(
      "section_id, sort_order, title, content_type, content_markdown, chart_config, table_data"
    )
    .eq("report_id", reportId)
    .order("sort_order");

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
    sections_snapshot: currentSections ?? [],
    edited_section_id: null,
    edit_instruction: `恢复到版本 ${version.version_num}`,
  });

  // Delete existing sections and re-insert from snapshot
  await supabase
    .from("report_sections")
    .delete()
    .eq("report_id", reportId);

  if (sections.length > 0) {
    const rows = sections.map((s: ReportSection) => ({
      report_id: reportId,
      section_id: s.section_id,
      sort_order: s.sort_order,
      title: s.title || null,
      content_type: s.content_type,
      content_markdown: s.content_markdown || null,
      chart_config: s.chart_config || null,
      table_data: s.table_data || null,
    }));

    const { error: insertErr } = await supabase
      .from("report_sections")
      .insert(rows);

    if (insertErr) {
      return Response.json({ error: insertErr.message }, { status: 500 });
    }
  }

  // Update report timestamp
  await supabase
    .from("reports")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", reportId);

  return Response.json({ ok: true, sections });
}
