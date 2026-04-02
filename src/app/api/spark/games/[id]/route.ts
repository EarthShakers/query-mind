import { z } from "zod";
import { getSessionUser } from "@/lib/auth/auth";
import { supabaseAdmin } from "@/lib/supabase";

const patchSchema = z.object({
  description: z.string().trim().max(500).nullable().optional(),
  coverUrl: z.string().trim().url().max(2048).nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  if (!supabaseAdmin) {
    return Response.json(
      { error: "服务器未配置 SUPABASE_SERVICE_ROLE_KEY" },
      { status: 503 }
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "无效 JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("spark_snapshots")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return Response.json({ error: existingError.message }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: "游戏不存在" }, { status: 404 });
  }
  if (existing.user_id !== user.userId) {
    return Response.json({ error: "无权修改该游戏" }, { status: 403 });
  }

  const description =
    parsed.data.description === undefined
      ? undefined
      : parsed.data.description?.trim() || null;
  const coverUrl =
    parsed.data.coverUrl === undefined
      ? undefined
      : parsed.data.coverUrl?.trim() || null;

  const updates: Record<string, string | null> = {};
  if (description !== undefined) updates.description = description;
  if (coverUrl !== undefined) updates.cover_url = coverUrl;

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "没有可更新的字段" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("spark_snapshots")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.userId)
    .select("id, description, cover_url")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    game: {
      id: String(data.id),
      description:
        typeof data.description === "string" ? data.description : null,
      coverUrl: typeof data.cover_url === "string" ? data.cover_url : null,
    },
  });
}
