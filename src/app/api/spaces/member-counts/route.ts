import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ids = searchParams.get("ids");
    if (!ids) {
      return Response.json({});
    }

    const spaceIds = ids.split(",").filter(Boolean);
    if (spaceIds.length === 0) {
      return Response.json({});
    }

    const { data, error } = await supabase
      .from("space_members")
      .select("space_id")
      .in("space_id", spaceIds);

    if (error) throw new Error(error.message);

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      counts[row.space_id] = (counts[row.space_id] ?? 0) + 1;
    }

    return Response.json(counts);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
