import { supabase } from "@/lib/supabase";
import { getSpaceContext } from "@/lib/auth";
import { NextRequest } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  try {
    const { spaceId } = await params;
    const { userId, tenantId, tenantRole } = getSpaceContext(req);

    if (!userId) {
      return Response.json({ error: "请先登录" }, { status: 401 });
    }

    const { name } = await req.json();
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return Response.json({ error: "空间名称不能为空" }, { status: 400 });
    }

    // Verify the space exists
    const { data: space, error: spaceError } = await supabase
      .from("spaces")
      .select("id, tenant_id")
      .eq("id", spaceId)
      .single();

    if (spaceError || !space) {
      return Response.json({ error: "空间不存在" }, { status: 404 });
    }

    // Enterprise space: need tenant admin
    if (space.tenant_id === tenantId) {
      if (tenantRole !== "admin") {
        return Response.json({ error: "需要企业管理员权限" }, { status: 403 });
      }
    } else {
      // Personal space: need space admin
      const { data: member } = await supabase
        .from("space_members")
        .select("role")
        .eq("space_id", spaceId)
        .eq("user_id", userId)
        .single();

      if (!member || member.role !== "admin") {
        return Response.json({ error: "无权修改此空间" }, { status: 403 });
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from("spaces")
      .update({ name: name.trim() })
      .eq("id", spaceId)
      .select("id, name")
      .single();

    if (updateError) throw new Error(updateError.message);

    return Response.json(updated);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  try {
    const { spaceId } = await params;
    const { userId, tenantId, tenantRole } = getSpaceContext(req);

    if (!userId) {
      return Response.json({ error: "请先登录" }, { status: 401 });
    }

    // Verify the space exists and belongs to the user's tenant
    const { data: space, error: spaceError } = await supabase
      .from("spaces")
      .select("id, tenant_id, is_default")
      .eq("id", spaceId)
      .single();

    if (spaceError || !space) {
      return Response.json({ error: "空间不存在" }, { status: 404 });
    }

    // Enterprise space: need tenant admin
    if (space.tenant_id === tenantId) {
      if (tenantRole !== "admin") {
        return Response.json({ error: "需要企业管理员权限" }, { status: 403 });
      }
    } else {
      // Personal space: verify the user is the owner (admin member)
      const { data: member } = await supabase
        .from("space_members")
        .select("role")
        .eq("space_id", spaceId)
        .eq("user_id", userId)
        .single();

      if (!member || member.role !== "admin") {
        return Response.json({ error: "无权删除此空间" }, { status: 403 });
      }
    }

    // Delete all documents in this space
    await supabase.from("documents").delete().eq("space_id", spaceId);

    // Delete all space members
    await supabase.from("space_members").delete().eq("space_id", spaceId);

    // Reset active_space_id for users pointing to this space
    await supabase
      .from("users")
      .update({ active_space_id: null })
      .eq("active_space_id", spaceId);

    // Delete the space itself
    const { error: deleteError } = await supabase
      .from("spaces")
      .delete()
      .eq("id", spaceId);

    if (deleteError) throw new Error(deleteError.message);

    return Response.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
