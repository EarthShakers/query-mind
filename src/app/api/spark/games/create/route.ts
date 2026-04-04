import { z } from "zod";
import { getSessionUser } from "@/lib/auth/auth";
import { normalizeSparkSlug, prettifySparkSlug } from "@/lib/spark/slug";
import { supabaseAdmin } from "@/lib/supabase";

const schema = z.object({
  slug: z.string().trim().min(1).max(64),
  title: z.string().trim().max(120).optional(),
});

const STARTER_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Game Draft</title>
  <style>
    html, body { margin: 0; height: 100%; }
    body {
      display: grid;
      place-items: center;
      background: radial-gradient(circle at 20% 10%, #12303f 0%, #0b1220 42%, #020617 100%);
      color: #e2e8f0;
      font-family: system-ui, sans-serif;
    }
    .card {
      width: min(680px, calc(100vw - 32px));
      text-align: left;
      padding: 24px;
      border: 1px solid #334155;
      border-radius: 16px;
      background: rgba(15, 23, 42, 0.72);
    }
    h1 { margin: 0 0 12px; font-size: 26px; }
    p { margin: 0 0 8px; line-height: 1.6; color: #cbd5e1; }
    code {
      display: inline-block;
      margin-top: 8px;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid #0f766e;
      background: #042f2e;
      color: #99f6e4;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>你的游戏草稿已创建</h1>
    <p>在游戏详情页使用「AI 生成/修改游戏」输入一句话需求，即可自动写入这份 index.html。</p>
    <p>也可以直接手写代码覆盖这个文件。</p>
    <code>提示：支持多次迭代，让 AI 在现有代码上继续改。</code>
  </div>
</body>
</html>
`;

export async function POST(req: Request) {
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
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const slug = normalizeSparkSlug(parsed.data.slug);
  if (!slug) {
    return Response.json({ error: "slug 不合法" }, { status: 400 });
  }
  const title = (parsed.data.title?.trim() || prettifySparkSlug(slug)).slice(0, 120);
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("spark_snapshots")
    .insert({
      user_id: user.userId,
      slug,
      title,
      files: { "index.html": STARTER_HTML },
      is_public: false,
      review_status: "pending",
      review_note: null,
      reviewed_by: null,
      reviewed_at: null,
      updated_at: now,
    })
    .select("id, user_id, slug, title, description, cover_url, is_public, review_status, updated_at, created_at")
    .single();

  if (error) {
    const msg =
      /duplicate key|unique/i.test(error.message)
        ? "该 slug 已存在，请换一个名字"
        : error.message;
    return Response.json({ error: msg }, { status: 400 });
  }

  return Response.json({
    ok: true,
    game: {
      id: String(data.id),
      user_id: String(data.user_id),
      slug: String(data.slug),
      title: String(data.title || prettifySparkSlug(String(data.slug))),
      description: typeof data.description === "string" ? data.description : null,
      cover_url: typeof data.cover_url === "string" ? data.cover_url : null,
      is_public: data.is_public !== false,
      review_status:
        data.review_status === "approved" || data.review_status === "rejected"
          ? data.review_status
          : "pending",
      updated_at: String(data.updated_at),
      created_at: typeof data.created_at === "string" ? data.created_at : undefined,
      author_name: user.displayName || user.email.split("@")[0] || "我",
    },
  });
}
