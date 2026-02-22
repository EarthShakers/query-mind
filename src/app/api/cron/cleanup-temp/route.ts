import { supabase } from "@/lib/supabase";

/**
 * Cron endpoint to clean up temporary spaces older than 1 day.
 * Can be triggered by Vercel Cron or manually via GET request.
 *
 * Expects CRON_SECRET env var for authentication.
 */
export async function GET(req: Request) {
  // Verify cron secret
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 1);
    const cutoffISO = cutoff.toISOString();

    // Find temp spaces older than 1 day
    const { data: tempSpaces, error: findError } = await supabase
      .from("spaces")
      .select("id")
      .eq("is_temp", true)
      .lt("created_at", cutoffISO);

    if (findError) throw new Error(findError.message);

    if (!tempSpaces || tempSpaces.length === 0) {
      return Response.json({ deleted: 0 });
    }

    const spaceIds = tempSpaces.map((s) => s.id);

    // Delete associated documents
    await supabase.from("documents").delete().in("space_id", spaceIds);

    // Delete associated data tables
    // First get table IDs to clean up data_columns
    const { data: tables } = await supabase
      .from("data_tables")
      .select("id")
      .in("space_id", spaceIds);

    if (tables && tables.length > 0) {
      const tableIds = tables.map((t) => t.id);
      await supabase.from("data_columns").delete().in("data_table_id", tableIds);
    }

    await supabase.from("data_tables").delete().in("space_id", spaceIds);

    // Delete space members (if any)
    await supabase.from("space_members").delete().in("space_id", spaceIds);

    // Delete the temp spaces themselves
    const { error: deleteError } = await supabase
      .from("spaces")
      .delete()
      .in("id", spaceIds);

    if (deleteError) throw new Error(deleteError.message);

    return Response.json({ deleted: spaceIds.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
