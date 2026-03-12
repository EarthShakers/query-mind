import { supabase } from "@/lib/supabase";
import { getSpaceContext } from "@/lib/auth/auth";
import { NextRequest } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId: paramTenantId } = await params;
    const { userId, tenantId, tenantRole } = getSpaceContext(req);

    if (!userId) {
      return Response.json({ error: "请先登录" }, { status: 401 });
    }

    // Must be a member of this tenant
    if (tenantId !== paramTenantId) {
      return Response.json({ error: "无权访问该租户的空间" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("spaces")
      .select("id, name, description, is_default, created_at")
      .eq("tenant_id", paramTenantId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return Response.json(data ?? []);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId: paramTenantId } = await params;
    const { userId, tenantId, tenantRole } = getSpaceContext(req);

    if (!userId) {
      return Response.json({ error: "请先登录" }, { status: 401 });
    }

    if (tenantId !== paramTenantId || tenantRole !== "admin") {
      return Response.json({ error: "需要企业管理员权限" }, { status: 403 });
    }

    const { name, description } = await req.json();
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return Response.json({ error: "空间名称不能为空" }, { status: 400 });
    }

    const { data: space, error } = await supabase
      .from("spaces")
      .insert({
        tenant_id: paramTenantId,
        name: name.trim(),
        description: description || "",
      })
      .select("id, name, description, is_default, created_at")
      .single();

    if (error) throw new Error(error.message);

    // Add creator as space admin
    await supabase
      .from("space_members")
      .insert({ space_id: space.id, user_id: userId, role: "admin" });

    return Response.json(space);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
