import { z } from "zod";
import { getSessionUser } from "@/lib/auth/auth";
import { supabaseAdmin } from "@/lib/supabase";

const patchSchema = z.object({
  description: z.string().trim().max(500).nullable().optional(),
  coverUrl: z.string().trim().url().max(2048).nullable().optional(),
  isPublic: z.boolean().optional(),
  submitReview: z.boolean().optional(),
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
    .select("id, user_id, review_status, reviewed_at, updated_at")
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
  const isPublic = parsed.data.isPublic;
  const submitReview = parsed.data.submitReview === true;

  if (isPublic === true && existing.review_status !== "approved") {
    return Response.json(
      { error: "该版本尚未审核通过，暂时不能上架" },
      { status: 409 }
    );
  }
  if (submitReview) {
    if (existing.review_status === "pending") {
      return Response.json({ error: "该版本已在审核中，请勿重复发布" }, { status: 409 });
    }

    const reviewedAtMs = existing.reviewed_at
      ? new Date(String(existing.reviewed_at)).getTime()
      : null;
    const updatedAtMs = existing.updated_at
      ? new Date(String(existing.updated_at)).getTime()
      : null;
    const hasNewVersion =
      reviewedAtMs == null || updatedAtMs == null || updatedAtMs > reviewedAtMs;

    if (!hasNewVersion) {
      return Response.json(
        { error: "当前版本已审核通过且无更新，无需重复发布" },
        { status: 409 }
      );
    }
  }

  const updates: Record<string, string | boolean | null> = {};
  if (description !== undefined) updates.description = description;
  if (coverUrl !== undefined) updates.cover_url = coverUrl;
  if (typeof isPublic === "boolean") updates.is_public = isPublic;
  if (submitReview) {
    updates.review_status = "pending";
    updates.is_public = false;
    updates.review_note = null;
    updates.reviewed_by = null;
    updates.reviewed_at = null;
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "没有可更新的字段" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("spark_snapshots")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.userId)
    .select("id, description, cover_url, is_public, review_status")
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
      isPublic: data.is_public !== false,
      reviewStatus:
        data.review_status === "pending" ||
        data.review_status === "approved" ||
        data.review_status === "rejected"
          ? data.review_status
          : "pending",
    },
  });
}

export async function DELETE(
  _req: Request,
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
    return Response.json({ error: "无权删除该游戏" }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from("spark_snapshots")
    .delete()
    .eq("id", id)
    .eq("user_id", user.userId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
