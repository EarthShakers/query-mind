import { getSessionUser } from "@/lib/auth/auth";
import { getContentTypeForPath, getSnapshotFile } from "@/lib/spark/public-games";
import { supabaseAdmin } from "@/lib/supabase";

function canAccessAdmin(user: Awaited<ReturnType<typeof getSessionUser>>): boolean {
  if (!user) return false;
  return user.role === "superAdmin" || user.tenantRole === "admin";
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string; path?: string[] }> }
) {
  const user = await getSessionUser();
  if (!canAccessAdmin(user)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!supabaseAdmin) {
    return new Response("Service unavailable", { status: 503 });
  }

  const params = await context.params;
  const { data, error } = await supabaseAdmin
    .from("spark_snapshots")
    .select("files")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !data) {
    return new Response("Not found", { status: 404 });
  }

  const relPath =
    params.path && params.path.length > 0
      ? params.path.join("/")
      : "index.html";
  const file = getSnapshotFile(
    (data as { files?: Record<string, string> | null }).files ?? null,
    relPath
  );
  if (file == null) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(file, {
    status: 200,
    headers: {
      "Content-Type": getContentTypeForPath(relPath),
      "Cache-Control": "private, max-age=60",
    },
  });
}

