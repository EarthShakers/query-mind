import { supabase } from "@/lib/supabase";
import { getSpaceContext } from "@/lib/auth/auth";

/** GET /api/reports/[id] — get report with sections */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: report, error: rErr } = await supabase
    .from("reports")
    .select("*")
    .eq("id", id)
    .single();

  if (rErr || !report) {
    return Response.json({ error: "报告不存在" }, { status: 404 });
  }

  const { data: sections } = await supabase
    .from("report_sections")
    .select("section_id, sort_order, title, content_type, content_markdown, chart_config, table_data")
    .eq("report_id", id)
    .order("sort_order");

  return Response.json({ ...report, sections: sections ?? [] });
}

/** DELETE /api/reports/[id] — delete a report */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = getSpaceContext(req);

  if (!ctx.userId) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const { error } = await supabase.from("reports").delete().eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
