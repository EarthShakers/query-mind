import { getSpaceContext } from "@/lib/auth";
import { checkFileLimit } from "@/lib/file-limits";
import { supabase } from "@/lib/supabase";
import { parseFile, createAndPopulateTable } from "@/lib/excel-parser";

const ALLOWED_EXTS = ["xlsx", "xls", "csv"];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

export async function GET(req: Request) {
  try {
    const ctx = getSpaceContext(req);
    if (!ctx.userId) {
      return Response.json({ error: "未登录" }, { status: 401 });
    }

    const url = new URL(req.url);
    const spaceId = url.searchParams.get("spaceId");

    if (!spaceId) {
      return Response.json({ error: "缺少 spaceId" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("data_tables")
      .select(
        "id, table_name, display_name, description, row_count, file_name, created_at"
      )
      .eq("space_id", spaceId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    // Get column counts
    const tableIds = (data || []).map((t) => t.id);
    let colCounts: Record<string, number> = {};
    if (tableIds.length > 0) {
      const { data: cols } = await supabase
        .from("data_columns")
        .select("data_table_id")
        .in("data_table_id", tableIds);

      if (cols) {
        for (const c of cols) {
          colCounts[c.data_table_id] = (colCounts[c.data_table_id] || 0) + 1;
        }
      }
    }

    const result = (data || []).map((t) => ({
      ...t,
      columnCount: colCounts[t.id] || 0,
    }));

    return Response.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = getSpaceContext(req);
    if (!ctx.userId) {
      return Response.json({ error: "未登录" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const spaceId = (formData.get("spaceId") as string) || ctx.activeSpaceId;

    if (!file) {
      return Response.json({ error: "请上传文件" }, { status: 400 });
    }

    if (!spaceId) {
      return Response.json({ error: "不能上传到空空间" }, { status: 403 });
    }

    // Permission: enterprise users need editor+ role
    if (ctx.tenantRole) {
      const canEdit =
        ctx.spaceRole === "admin" ||
        ctx.spaceRole === "editor" ||
        ctx.tenantRole === "admin";
      if (!canEdit) {
        console.log(ctx, "ctx");

        return Response.json({ error: "没有上传权限" }, { status: 403 });
      }
    }

    // File upload limit check
    const limitBlocked = await checkFileLimit(req, spaceId);
    if (limitBlocked) return limitBlocked;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTS.includes(ext ?? "")) {
      return Response.json(
        { error: "仅支持 .xlsx、.xls、.csv 文件" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return Response.json({ error: "文件大小不能超过 20MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const displayName = file.name.replace(/\.(xlsx|xls|csv)$/i, "");

    const parsed = parseFile(buffer, file.name);
    const result = await createAndPopulateTable(
      parsed,
      spaceId,
      ctx.tenantId,
      ctx.userId,
      file.name,
      displayName
    );

    return Response.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
