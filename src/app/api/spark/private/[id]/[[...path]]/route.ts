import { getSessionUser } from "@/lib/auth/auth";
import {
  getContentTypeForPath,
  getSnapshotFile,
} from "@/lib/spark/public-games";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string; path?: string[] }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!supabaseAdmin) {
    return new Response("Service unavailable", { status: 503 });
  }

  const params = await context.params;
  const { data, error } = await supabaseAdmin
    .from("spark_snapshots")
    .select("id, user_id, files")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !data) {
    return new Response("Not found", { status: 404 });
  }
  if (String(data.user_id) !== user.userId) {
    return new Response("Forbidden", { status: 403 });
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

