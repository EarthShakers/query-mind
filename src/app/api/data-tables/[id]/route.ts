import { getSpaceContext } from "@/lib/auth/auth";
import { supabase } from "@/lib/supabase";
import { dropUserTable } from "@/lib/data/excel-parser";
import { queryUserData } from "@/lib/data/pg";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = getSpaceContext(req);
    if (!ctx.userId) {
      return Response.json({ error: "未登录" }, { status: 401 });
    }

    const { id } = await params;
    const url = new URL(req.url);
    const preview = url.searchParams.get("preview") === "true";

    const { data: table } = await supabase
      .from("data_tables")
      .select("id, table_name, display_name, description, row_count, file_name, created_at")
      .eq("id", id)
      .single();

    if (!table) {
      return Response.json({ error: "数据表不存在" }, { status: 404 });
    }

    const { data: columns } = await supabase
      .from("data_columns")
      .select("column_name, display_name, data_type, description, ordinal")
      .eq("data_table_id", id)
      .order("ordinal", { ascending: true });

    // Fetch preview rows if requested
    let rows: Record<string, unknown>[] | undefined;
    if (preview) {
      try {
        rows = await queryUserData(
          `SELECT * FROM "${table.table_name}" ORDER BY id LIMIT 50`
        );
      } catch {
        rows = [];
      }
    }

    return Response.json({ ...table, columns: columns || [], ...(preview ? { rows } : {}) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = getSpaceContext(req);
    if (!ctx.userId) {
      return Response.json({ error: "未登录" }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership: user must have access to the space
    const { data: table } = await supabase
      .from("data_tables")
      .select("space_id, uploaded_by")
      .eq("id", id)
      .single();

    if (!table) {
      return Response.json({ error: "数据表不存在" }, { status: 404 });
    }

    // Only uploader or enterprise admin can delete
    const isUploader = table.uploaded_by === ctx.userId;
    const isAdmin = ctx.tenantRole === "admin" || ctx.spaceRole === "admin";
    if (!isUploader && !isAdmin) {
      return Response.json({ error: "没有删除权限" }, { status: 403 });
    }

    await dropUserTable(id);

    return Response.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
