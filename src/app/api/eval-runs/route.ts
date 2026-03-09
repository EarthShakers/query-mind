import { supabase } from "@/lib/supabase";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? "30");
    const { data, error } = await supabase
      .from("eval_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, 100));

    if (error) throw new Error(error.message);
    return Response.json(data ?? []);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
