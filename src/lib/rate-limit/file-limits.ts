import { supabase } from "../supabase";
import { getSpaceContext } from "../auth/auth";
import { getTierConfig } from "./tier-config";

/**
 * Check if the user has reached their file upload limit.
 * Returns a 403 Response if over limit, or null if OK to proceed.
 */
export async function checkFileLimit(
  req: Request,
  spaceId: string
): Promise<Response | null> {
  const ctx = getSpaceContext(req);
  const tier = getTierConfig(ctx);

  // Count documents (by unique title, excluding presets)
  const { data: docs } = await supabase
    .from("documents")
    .select("title, metadata")
    .eq("space_id", spaceId);

  const uniqueDocTitles = new Set<string>();
  for (const doc of docs ?? []) {
    const meta = doc.metadata as Record<string, unknown> | null;
    if (meta?.preset === true) continue; // Skip preset docs
    uniqueDocTitles.add(doc.title);
  }

  // Count data tables
  const { count: tableCount } = await supabase
    .from("data_tables")
    .select("id", { count: "exact", head: true })
    .eq("space_id", spaceId);

  const total = uniqueDocTitles.size + (tableCount ?? 0);

  if (total >= tier.maxFiles) {
    const hint = tier.upgradeHint ? `，${tier.upgradeHint}` : "";
    const msg = `已达上传上限（${tier.maxFiles} 个）${hint}`;

    return Response.json({ error: msg }, { status: 403 });
  }

  return null;
}
