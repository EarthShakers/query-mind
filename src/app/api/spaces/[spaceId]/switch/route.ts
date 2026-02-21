import { supabase } from "@/lib/supabase";
import {
  getSpaceContext,
  createToken,
  buildSessionCookie,
  type SessionUser,
  type SpaceMembership,
} from "@/lib/auth";
import { NextRequest } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  try {
    const { spaceId: targetSpaceId } = await params;
    const { userId } = getSpaceContext(req);

    if (!userId) {
      return Response.json({ error: "请先登录" }, { status: 401 });
    }

    // Verify user is a member of this space
    const { data: spaceMember } = await supabase
      .from("space_members")
      .select("role")
      .eq("space_id", targetSpaceId)
      .eq("user_id", userId)
      .single();

    if (!spaceMember) {
      return Response.json({ error: "你不是该空间的成员" }, { status: 403 });
    }

    // Update active_space_id in DB
    await supabase
      .from("users")
      .update({ active_space_id: targetSpaceId })
      .eq("id", userId);

    // Re-build session with new activeSpaceId
    const { data: user } = await supabase
      .from("users")
      .select("id, email, role, tenant_id, display_name")
      .eq("id", userId)
      .single();

    if (!user) {
      return Response.json({ error: "用户不存在" }, { status: 404 });
    }

    const { data: tenantMember } = await supabase
      .from("tenant_members")
      .select("tenant_id, role")
      .eq("user_id", userId)
      .single();

    let spaces: SpaceMembership[] = [];
    if (tenantMember) {
      const { data: spaceMembers } = await supabase
        .from("space_members")
        .select("space_id, role, spaces(id, name)")
        .eq("user_id", userId);

      if (spaceMembers) {
        spaces = spaceMembers.map((sm: any) => ({
          spaceId: sm.space_id,
          spaceName: sm.spaces?.name ?? "",
          role: sm.role as "admin" | "editor" | "viewer",
        }));
      }
    }

    const sessionUser: SessionUser = {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: tenantMember?.tenant_id ?? user.tenant_id,
      displayName: user.display_name,
      tenantRole: (tenantMember?.role as "admin" | "member") ?? null,
      spaces,
      activeSpaceId: targetSpaceId,
    };

    const token = await createToken(sessionUser);

    return Response.json(
      { user: sessionUser },
      { headers: { "Set-Cookie": buildSessionCookie(token) } }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
