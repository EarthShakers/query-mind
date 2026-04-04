import { z } from "zod";
import { getSessionUser } from "@/lib/auth/auth";
import { supabaseAdmin } from "@/lib/supabase";

const reviewSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
});

function canReview(
  user: Awaited<ReturnType<typeof getSessionUser>>
): boolean {
  if (!user) return false;
  return user.role === "superAdmin" || user.tenantRole === "admin";
}

export async function GET() {
  const user = await getSessionUser();
  if (!canReview(user)) {
    return Response.json({ error: "需要管理员权限" }, { status: 403 });
  }
  if (!supabaseAdmin) {
    return Response.json(
      { error: "服务器未配置 SUPABASE_SERVICE_ROLE_KEY" },
      { status: 503 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("spark_snapshots")
    .select(
      "id, user_id, slug, title, description, cover_url, is_public, review_status, review_note, updated_at, created_at"
    )
    .order("updated_at", { ascending: false })
    .limit(300);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const userIds = Array.from(
    new Set(
      (data ?? [])
        .map((row) =>
          typeof row.user_id === "string" ? row.user_id : null
        )
        .filter((v): v is string => Boolean(v))
    )
  );

  const authorMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await supabaseAdmin
      .from("users")
      .select("id, email, display_name")
      .in("id", userIds);
    for (const row of users ?? []) {
      const fallback =
        typeof row.email === "string" ? row.email.split("@")[0] : "匿名作者";
      authorMap.set(row.id, row.display_name || fallback);
    }
  }

  return Response.json({
    items: (data ?? []).map((row) => ({
      id: String(row.id),
      user_id: String(row.user_id),
      slug: String(row.slug),
      title:
        typeof row.title === "string" && row.title.trim()
          ? row.title
          : String(row.slug),
      description: typeof row.description === "string" ? row.description : null,
      cover_url: typeof row.cover_url === "string" ? row.cover_url : null,
      is_public: row.is_public !== false,
      review_status:
        row.review_status === "approved" || row.review_status === "rejected"
          ? row.review_status
          : "pending",
      review_note: typeof row.review_note === "string" ? row.review_note : null,
      updated_at: String(row.updated_at),
      created_at: String(row.created_at),
      author_name: authorMap.get(String(row.user_id)) || "匿名作者",
    })),
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!canReview(user)) {
    return Response.json({ error: "需要管理员权限" }, { status: 403 });
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
  const parsed = reviewSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const nextStatus =
    parsed.data.action === "approve" ? "approved" : "rejected";

  const { data, error } = await supabaseAdmin
    .from("spark_snapshots")
    .update({
      review_status: nextStatus,
      review_note: parsed.data.note?.trim() || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user!.userId,
    })
    .eq("id", parsed.data.id)
    .select("id, review_status, review_note, reviewed_at")
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "记录不存在" }, { status: 404 });
  }

  return Response.json({
    ok: true,
    item: {
      id: String(data.id),
      review_status:
        data.review_status === "approved" || data.review_status === "rejected"
          ? data.review_status
          : "pending",
      review_note: typeof data.review_note === "string" ? data.review_note : null,
      reviewed_at: typeof data.reviewed_at === "string" ? data.reviewed_at : null,
    },
  });
}

