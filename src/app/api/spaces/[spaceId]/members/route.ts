import { supabase } from "@/lib/supabase";
import { getSpaceContext } from "@/lib/auth/auth";
import { NextRequest } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  try {
    const { spaceId } = await params;
    const { userId } = getSpaceContext(req);

    if (!userId) {
      return Response.json({ error: "请先登录" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("space_members")
      .select("id, user_id, role, created_at, users(id, email, display_name)")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    const members = (data ?? []).map((m: any) => ({
      id: m.id,
      userId: m.user_id,
      role: m.role,
      email: m.users?.email ?? "",
      displayName: m.users?.display_name ?? null,
      createdAt: m.created_at,
    }));

    return Response.json(members);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  try {
    const { spaceId } = await params;
    const { userId, tenantRole } = getSpaceContext(req);

    if (!userId) {
      return Response.json({ error: "请先登录" }, { status: 401 });
    }

    // Check if current user is space admin or tenant admin
    const { data: myMembership } = await supabase
      .from("space_members")
      .select("role")
      .eq("space_id", spaceId)
      .eq("user_id", userId)
      .single();

    const isSpaceAdmin = myMembership?.role === "admin";
    if (!isSpaceAdmin && tenantRole !== "admin") {
      return Response.json({ error: "需要空间管理员或企业管理员权限" }, { status: 403 });
    }

    const { userId: targetUserId, role } = await req.json();
    if (!targetUserId) {
      return Response.json({ error: "用户 ID 不能为空" }, { status: 400 });
    }

    const memberRole = role || "viewer";

    const { data, error } = await supabase
      .from("space_members")
      .upsert(
        { space_id: spaceId, user_id: targetUserId, role: memberRole },
        { onConflict: "space_id,user_id" }
      )
      .select("id, space_id, user_id, role")
      .single();

    if (error) throw new Error(error.message);
    return Response.json(data);
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
    const { userId, tenantRole } = getSpaceContext(req);

    if (!userId) {
      return Response.json({ error: "请先登录" }, { status: 401 });
    }

    const { data: myMembership } = await supabase
      .from("space_members")
      .select("role")
      .eq("space_id", spaceId)
      .eq("user_id", userId)
      .single();

    const isSpaceAdmin = myMembership?.role === "admin";
    if (!isSpaceAdmin && tenantRole !== "admin") {
      return Response.json({ error: "需要空间管理员或企业管理员权限" }, { status: 403 });
    }

    const url = new URL(req.url);
    const targetUserId = url.searchParams.get("userId");
    if (!targetUserId) {
      return Response.json({ error: "请指定要移除的用户" }, { status: 400 });
    }

    const { error } = await supabase
      .from("space_members")
      .delete()
      .eq("space_id", spaceId)
      .eq("user_id", targetUserId);

    if (error) throw new Error(error.message);
    return Response.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
