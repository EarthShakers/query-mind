import { supabase } from "@/lib/supabase";
import {
  getSessionUser,
  DEMO_TENANT_ID,
  type SpaceMembership,
} from "@/lib/auth/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ user: null }, { status: 401 });
  }

  // Re-query memberships for freshness
  const { data: tenantMember } = await supabase
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", user.userId)
    .single();

  let spaces: SpaceMembership[] = [];
  let tenantRole: "admin" | "member" | null = null;
  let tenantId = DEMO_TENANT_ID;
  let activeSpaceId: string | null = null;

  // Get saved active_space_id from DB
  const { data: dbUser } = await supabase
    .from("users")
    .select("active_space_id, display_name, email")
    .eq("id", user.userId)
    .single();

  if (tenantMember) {
    // Enterprise member
    tenantId = tenantMember.tenant_id;
    tenantRole = tenantMember.role as "admin" | "member";

    const { data: spaceMembers } = await supabase
      .from("space_members")
      .select("space_id, role, spaces(id, name, is_default)")
      .eq("user_id", user.userId);

    if (spaceMembers) {
      spaces = spaceMembers.map((sm: any) => ({
        spaceId: sm.space_id,
        spaceName: sm.spaces?.name ?? "",
        role: sm.role as "admin" | "editor" | "viewer",
        isDefault: sm.spaces?.is_default ?? false,
      }));
    }

    activeSpaceId = dbUser?.active_space_id || spaces[0]?.spaceId || null;
  } else {
    // Personal user
    const { data: spaceMembers } = await supabase
      .from("space_members")
      .select("space_id, role, spaces(id, name, is_default)")
      .eq("user_id", user.userId);

    if (spaceMembers && spaceMembers.length > 0) {
      spaces = spaceMembers.map((sm: any) => ({
        spaceId: sm.space_id,
        spaceName: sm.spaces?.name ?? "",
        role: sm.role as "admin" | "editor" | "viewer",
        isDefault: sm.spaces?.is_default ?? false,
      }));
      activeSpaceId = dbUser?.active_space_id || spaces[0]?.spaceId || null;
    } else {
      // Legacy user — create personal space on the fly
      const userName = dbUser?.display_name || dbUser?.email?.split("@")[0] || "用户";
      const { data: personalSpace } = await supabase
        .from("spaces")
        .insert({
          tenant_id: DEMO_TENANT_ID,
          name: `${userName} 的个人空间`,
          is_default: false,
        })
        .select("id, name")
        .single();

      if (personalSpace) {
        await supabase
          .from("space_members")
          .insert({ space_id: personalSpace.id, user_id: user.userId, role: "admin" });

        await supabase
          .from("users")
          .update({ active_space_id: personalSpace.id })
          .eq("id", user.userId);

        spaces = [{ spaceId: personalSpace.id, spaceName: personalSpace.name, role: "admin", isDefault: false }];
        activeSpaceId = personalSpace.id;
      }
    }
  }

  return Response.json({
    user: {
      ...user,
      tenantId,
      tenantRole,
      spaces,
      activeSpaceId,
    },
  });
}
