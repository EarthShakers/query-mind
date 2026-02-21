import { supabase } from "@/lib/supabase";
import { getSpaceContext, DEMO_TENANT_ID } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const { data, error } = await supabase
      .from("tenants")
      .select("id, name, created_at")
      .neq("id", DEMO_TENANT_ID)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return Response.json(data ?? []);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = getSpaceContext(req);
    if (!userId) {
      return Response.json({ error: "请先登录" }, { status: 401 });
    }

    const { name } = await req.json();
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return Response.json({ error: "企业名称不能为空" }, { status: 400 });
    }

    // Check if user already belongs to a tenant
    const { data: existingMember } = await supabase
      .from("tenant_members")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (existingMember) {
      return Response.json({ error: "你已加入一个企业，不能重复创建" }, { status: 400 });
    }

    // Create tenant
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert({ name: name.trim() })
      .select("id, name")
      .single();

    if (tenantError) throw new Error(tenantError.message);

    // Add user as admin
    const { error: memberError } = await supabase
      .from("tenant_members")
      .insert({ tenant_id: tenant.id, user_id: userId, role: "admin" });

    if (memberError) throw new Error(memberError.message);

    // Create default space
    const { data: space, error: spaceError } = await supabase
      .from("spaces")
      .insert({
        tenant_id: tenant.id,
        name: "默认空间",
        is_default: true,
      })
      .select("id, name")
      .single();

    if (spaceError) throw new Error(spaceError.message);

    // Add user to default space as admin
    const { error: spaceMemberError } = await supabase
      .from("space_members")
      .insert({ space_id: space.id, user_id: userId, role: "admin" });

    if (spaceMemberError) throw new Error(spaceMemberError.message);

    // Update user's tenant_id and active_space_id
    await supabase
      .from("users")
      .update({ tenant_id: tenant.id, active_space_id: space.id })
      .eq("id", userId);

    return Response.json({ tenant, defaultSpace: space });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
