import { z } from "zod";
import { getSessionUser } from "@/lib/auth/auth";
import { supabaseAdmin } from "@/lib/supabase";

const saveSchema = z.object({
  path: z.string().trim().min(1).max(256),
  content: z.string().max(1_000_000),
});

const PATH_DENY = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
]);

function normalizePath(raw: string): string {
  return raw
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .trim();
}

function isAllowedPath(path: string): boolean {
  if (!path || path.includes("..")) return false;
  const base = path.split("/").pop()?.toLowerCase() || "";
  if (PATH_DENY.has(base)) return false;
  const ext = base.includes(".") ? base.split(".").pop()?.toLowerCase() : "";
  return Boolean(
    ext &&
      ["html", "htm", "css", "js", "mjs", "cjs", "json", "txt", "md", "svg"].includes(ext)
  );
}

async function getOwnedGame(id: string, userId: string) {
  if (!supabaseAdmin) return { error: "服务未就绪", status: 503 } as const;
  const { data, error } = await supabaseAdmin
    .from("spark_snapshots")
    .select("id, user_id, slug, title, files, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: error.message, status: 500 } as const;
  if (!data) return { error: "游戏不存在", status: 404 } as const;
  if (String(data.user_id) !== userId) {
    return { error: "无权访问该游戏", status: 403 } as const;
  }
  return { data } as const;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const game = await getOwnedGame(id, user.userId);
  if ("error" in game) {
    return Response.json({ error: game.error }, { status: game.status });
  }

  const files = (game.data.files as Record<string, string> | null) ?? {};
  const entries = Object.keys(files).sort((a, b) => a.localeCompare(b));
  return Response.json({
    id: String(game.data.id),
    slug: String(game.data.slug),
    title: String((game.data as { title?: string | null }).title || game.data.slug),
    updated_at: String(game.data.updated_at),
    files,
    entries,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  if (!supabaseAdmin) {
    return Response.json({ error: "服务未就绪" }, { status: 503 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "无效 JSON" }, { status: 400 });
  }
  const parsed = saveSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const game = await getOwnedGame(id, user.userId);
  if ("error" in game) {
    return Response.json({ error: game.error }, { status: game.status });
  }

  const path = normalizePath(parsed.data.path);
  if (!isAllowedPath(path)) {
    return Response.json({ error: "非法路径或不支持的文件类型" }, { status: 400 });
  }

  const files = (game.data.files as Record<string, string> | null) ?? {};
  const nextFiles = { ...files, [path]: parsed.data.content };
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("spark_snapshots")
    .update({
      files: nextFiles,
      updated_at: now,
      review_status: "pending",
      review_note: null,
      reviewed_by: null,
      reviewed_at: null,
    })
    .eq("id", id)
    .eq("user_id", user.userId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    path,
    updated_at: now,
  });
}
