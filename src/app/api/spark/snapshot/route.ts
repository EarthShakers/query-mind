import { z } from "zod";
import { getSessionUser } from "@/lib/auth/auth";
import { supabaseAdmin } from "@/lib/supabase";

const bodySchema = z.object({
  slug: z.string().trim().min(1).max(64).optional(),
  files: z.record(z.string(), z.string()),
});

const MAX_KEYS = 200;
const MAX_VALUE_LEN = 500_000;
const MAX_TOTAL = 5 * 1024 * 1024;

function validateFiles(files: Record<string, string>): string | null {
  const keys = Object.keys(files);
  if (keys.length === 0) return "files 不能为空";
  if (keys.length > MAX_KEYS) return `文件数量超过 ${MAX_KEYS}`;
  let total = 0;
  for (const k of keys) {
    if (k.length > 512 || k.includes("..") || k.startsWith("/")) {
      return "非法路径: " + k;
    }
    const v = files[k];
    if (typeof v !== "string") return "内容必须是字符串";
    if (v.length > MAX_VALUE_LEN) return `文件过大: ${k}`;
    total += Buffer.byteLength(k, "utf-8") + Buffer.byteLength(v, "utf-8");
    if (total > MAX_TOTAL) return "快照总大小超过限制";
  }
  return null;
}

export async function GET(req: Request) {
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
  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") || "default").trim() || "default";

  const { data, error } = await supabaseAdmin
    .from("spark_snapshots")
    .select("slug, files, updated_at")
    .eq("user_id", user.userId)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return Response.json({ slug, files: null, updated_at: null });
  }
  return Response.json({
    slug: data.slug,
    files: data.files as Record<string, string>,
    updated_at: data.updated_at,
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json(
      { error: "未登录：使用 spark login 写入浏览器 qm_session" },
      { status: 401 }
    );
  }
  if (!supabaseAdmin) {
    return Response.json(
      { error: "服务器未配置 SUPABASE_SERVICE_ROLE_KEY，无法写入 spark_snapshots" },
      { status: 503 }
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "无效 JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const slug = (parsed.data.slug || "default").trim() || "default";
  const files = parsed.data.files;
  const invalid = validateFiles(files);
  if (invalid) {
    return Response.json({ error: invalid }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("spark_snapshots").upsert(
    {
      user_id: user.userId,
      slug,
      files,
      updated_at: now,
    },
    { onConflict: "user_id,slug" }
  );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, slug, updated_at: now });
}
