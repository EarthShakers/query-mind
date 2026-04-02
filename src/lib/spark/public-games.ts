import { supabaseAdmin } from "@/lib/supabase";

export interface SparkPublicGame {
  id: string;
  user_id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  author_name: string;
  updated_at: string;
  created_at?: string;
  files?: Record<string, string> | null;
}

export function prettifySparkSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function getPublicGames(): Promise<SparkPublicGame[]> {
  if (!supabaseAdmin) return [];

  const { data, error } = await supabaseAdmin
    .from("spark_snapshots")
    .select("id, user_id, slug, title, description, cover_url, updated_at, created_at")
    .eq("is_public", true)
    .order("updated_at", { ascending: false });

  if (error || !data) return [];

  const userIds = Array.from(
    new Set(
      data
        .map((row) => (typeof row.user_id === "string" ? row.user_id : null))
        .filter((value): value is string => Boolean(value))
    )
  );

  const authorMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await supabaseAdmin
      .from("users")
      .select("id, email, display_name")
      .in("id", userIds);

    for (const user of users ?? []) {
      const fallback =
        typeof user.email === "string" ? user.email.split("@")[0] : "匿名作者";
      authorMap.set(user.id, user.display_name || fallback);
    }
  }

  return data.map((row) => ({
    id: String(row.id),
    user_id: String(row.user_id),
    slug: String(row.slug),
    title: String((row as { title?: string | null }).title || prettifySparkSlug(String(row.slug))),
    description:
      typeof (row as { description?: string | null }).description === "string"
        ? (row as { description?: string | null }).description ?? null
        : null,
    cover_url:
      typeof (row as { cover_url?: string | null }).cover_url === "string"
        ? (row as { cover_url?: string | null }).cover_url ?? null
        : null,
    author_name: authorMap.get(String(row.user_id)) || "匿名作者",
    updated_at: String(row.updated_at),
    created_at: typeof row.created_at === "string" ? row.created_at : undefined,
  }));
}

export async function getPublicGameById(
  id: string
): Promise<SparkPublicGame | null> {
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from("spark_snapshots")
    .select("id, user_id, slug, title, description, cover_url, updated_at, created_at, files")
    .eq("id", id)
    .eq("is_public", true)
    .maybeSingle();

  if (error || !data) return null;

  let authorName = "匿名作者";
  if (typeof data.user_id === "string") {
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("email, display_name")
      .eq("id", data.user_id)
      .maybeSingle();

    if (user) {
      authorName =
        user.display_name ||
        (typeof user.email === "string" ? user.email.split("@")[0] : "匿名作者");
    }
  }

  return {
    id: String(data.id),
    user_id: String(data.user_id),
    slug: String(data.slug),
    title: String((data as { title?: string | null }).title || prettifySparkSlug(String(data.slug))),
    description:
      typeof (data as { description?: string | null }).description === "string"
        ? (data as { description?: string | null }).description ?? null
        : null,
    cover_url:
      typeof (data as { cover_url?: string | null }).cover_url === "string"
        ? (data as { cover_url?: string | null }).cover_url ?? null
        : null,
    author_name: authorName,
    updated_at: String(data.updated_at),
    created_at: typeof data.created_at === "string" ? data.created_at : undefined,
    files: (data.files as Record<string, string> | null) ?? {},
  };
}

export function getSnapshotFile(
  files: Record<string, string> | null | undefined,
  relPath: string
): string | null {
  if (!files) return null;
  const normalized = relPath.replace(/^\/+/, "").replace(/\\/g, "/") || "index.html";
  return typeof files[normalized] === "string" ? files[normalized] : null;
}

export function getContentTypeForPath(relPath: string): string {
  const lower = relPath.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    return "text/html; charset=utf-8";
  }
  if (lower.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) {
    return "application/javascript; charset=utf-8";
  }
  if (lower.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  if (lower.endsWith(".svg")) {
    return "image/svg+xml";
  }
  if (lower.endsWith(".txt")) {
    return "text/plain; charset=utf-8";
  }
  return "text/plain; charset=utf-8";
}
