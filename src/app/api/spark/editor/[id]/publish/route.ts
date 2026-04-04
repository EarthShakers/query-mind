import { z } from "zod";
import { getSessionUser } from "@/lib/auth/auth";
import { supabaseAdmin } from "@/lib/supabase";

const bodySchema = z.object({
  version: z.string().trim().min(1).max(40),
  note: z.string().trim().max(500).optional(),
  files: z.record(z.string(), z.string()),
});

const MAX_KEYS = 200;
const MAX_VALUE_LEN = 500_000;
const MAX_TOTAL = 5 * 1024 * 1024;

function validateFiles(files: Record<string, string>): string | null {
  const keys = Object.keys(files);
  if (keys.length === 0) return "没有可发布的文件";
  if (keys.length > MAX_KEYS) return `文件数量超过 ${MAX_KEYS}`;
  let total = 0;
  for (const k of keys) {
    if (k.length > 512 || k.includes("..") || k.startsWith("/")) {
      return "非法路径: " + k;
    }
    const v = files[k];
    if (typeof v !== "string") return "文件内容必须是字符串";
    if (v.length > MAX_VALUE_LEN) return `文件过大: ${k}`;
    total += Buffer.byteLength(k, "utf-8") + Buffer.byteLength(v, "utf-8");
    if (total > MAX_TOTAL) return "快照总大小超过限制";
  }
  return null;
}

function normalizeFiles(files: Record<string, string>): string {
  const keys = Object.keys(files).sort((a, b) => a.localeCompare(b));
  const obj: Record<string, string> = {};
  for (const k of keys) obj[k] = files[k];
  return JSON.stringify(obj);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });
  if (!supabaseAdmin) return Response.json({ error: "服务未就绪" }, { status: 503 });

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

  const files = parsed.data.files;
  const invalid = validateFiles(files);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  const indexHtml = (files["index.html"] || "").trim();
  if (!indexHtml) {
    return Response.json({ error: "请先完成 index.html 再发布" }, { status: 400 });
  }

  const { id } = await params;
  const { data: existing, error: findError } = await supabaseAdmin
    .from("spark_snapshots")
    .select("id, user_id, files, review_status, is_public")
    .eq("id", id)
    .maybeSingle();

  if (findError) return Response.json({ error: findError.message }, { status: 500 });
  if (!existing) return Response.json({ error: "游戏不存在" }, { status: 404 });
  if (String(existing.user_id) !== user.userId) {
    return Response.json({ error: "无权发布该游戏" }, { status: 403 });
  }

  const oldFiles = (existing.files as Record<string, string> | null) ?? {};
  const changed = normalizeFiles(oldFiles) !== normalizeFiles(files);
  if (!changed && (existing.review_status === "approved" || existing.review_status === "pending")) {
    return Response.json(
      { error: "当前版本无更新，无需重复发布" },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from("spark_snapshots")
    .update({
      files,
      updated_at: now,
      is_public: false,
      review_status: "pending",
      review_note: null,
      reviewed_by: null,
      reviewed_at: null,
    })
    .eq("id", id)
    .eq("user_id", user.userId);

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    updated_at: now,
    is_public: false,
    review_status: "pending",
    published_version: parsed.data.version,
    published_note: parsed.data.note?.trim() || null,
  });
}
