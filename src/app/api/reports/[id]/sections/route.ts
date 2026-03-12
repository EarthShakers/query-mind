import { supabase } from "@/lib/supabase";
import { getSpaceContext } from "@/lib/auth/auth";

/** PUT /api/reports/[id]/sections — bulk upsert sections */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = getSpaceContext(req);

  if (!ctx.userId) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const { title, sections } = await req.json();

  // Update report title
  if (title) {
    await supabase
      .from("reports")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  // Upsert sections
  if (Array.isArray(sections) && sections.length > 0) {
    const rows = sections.map((s: any) => ({
      report_id: id,
      section_id: s.section_id,
      sort_order: s.sort_order,
      title: s.title || null,
      content_type: s.content_type,
      content_markdown: s.content_markdown || null,
      chart_config: s.chart_config || null,
      table_data: s.table_data || null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("report_sections")
      .upsert(rows, { onConflict: "report_id,section_id" });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  return Response.json({ ok: true });
}
