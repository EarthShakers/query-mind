import { supabase } from "@/lib/supabase";
import { getTenantContext } from "@/lib/auth";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("roadmap_items")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) throw new Error(error.message);
    return Response.json(data ?? []);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { role } = getTenantContext(req);
    if (role !== "superAdmin") {
      return Response.json({ error: "仅管理员可操作" }, { status: 403 });
    }

    const body = await req.json();
    const { phase, phase_label, color, title, description, status, sort_order } = body;

    if (!phase || !phase_label || !title || !description) {
      return Response.json({ error: "缺少必填字段" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("roadmap_items")
      .insert({
        phase,
        phase_label,
        color: color || "indigo",
        title,
        description,
        status: status || "planned",
        sort_order: sort_order ?? 0,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return Response.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { role } = getTenantContext(req);
    if (role !== "superAdmin") {
      return Response.json({ error: "仅管理员可操作" }, { status: 403 });
    }

    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return Response.json({ error: "缺少 id" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("roadmap_items")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return Response.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { role } = getTenantContext(req);
    if (role !== "superAdmin") {
      return Response.json({ error: "仅管理员可操作" }, { status: 403 });
    }

    const { id } = await req.json();

    if (!id) {
      return Response.json({ error: "缺少 id" }, { status: 400 });
    }

    const { error } = await supabase
      .from("roadmap_items")
      .delete()
      .eq("id", id);

    if (error) throw new Error(error.message);
    return Response.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
