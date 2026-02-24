import { supabase } from "@/lib/supabase";

/** GET /api/reports/[id]/versions — list version history */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reportId } = await params;

  const { data, error } = await supabase
    .from("report_versions")
    .select("id, version_num, edited_section_id, edit_instruction, created_at")
    .eq("report_id", reportId)
    .order("version_num", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data ?? []);
}
