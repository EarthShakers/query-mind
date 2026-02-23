import { supabase } from "@/lib/supabase";
import { getSpaceContext } from "@/lib/auth";

/** GET /api/reports?spaceId=xxx — list reports for a space */
export async function GET(req: Request) {
  const ctx = getSpaceContext(req);
  const url = new URL(req.url);
  const spaceId = url.searchParams.get("spaceId") || ctx.activeSpaceId;

  if (!spaceId) {
    return Response.json({ error: "缺少 spaceId" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("reports")
    .select("id, title, created_at, updated_at")
    .eq("space_id", spaceId)
    .order("updated_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

/** POST /api/reports — create a new report */
export async function POST(req: Request) {
  const ctx = getSpaceContext(req);
  if (!ctx.userId) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const body = await req.json();
  const spaceId = body.spaceId || ctx.activeSpaceId;

  if (!spaceId) {
    return Response.json({ error: "缺少 spaceId" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("reports")
    .insert({
      space_id: spaceId,
      title: body.title || "未命名报告",
      created_by: ctx.userId,
    })
    .select("id, title")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}
