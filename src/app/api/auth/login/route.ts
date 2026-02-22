import { supabase } from "@/lib/supabase";
import {
  verifyPassword,
  createToken,
  buildSessionCookie,
  DEMO_TENANT_ID,
  DEMO_SPACE_ID,
  type SessionUser,
  type SpaceMembership,
} from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return Response.json({ error: "邮箱和密码不能为空" }, { status: 400 });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, password_hash, role, tenant_id, display_name, active_space_id")
      .eq("email", email.toLowerCase())
      .single();

    if (error || !user) {
      return Response.json({ error: "邮箱或密码错误" }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return Response.json({ error: "邮箱或密码错误" }, { status: 401 });
    }

    // Query tenant membership
    const { data: tenantMember } = await supabase
      .from("tenant_members")
      .select("tenant_id, role")
      .eq("user_id", user.id)
      .single();

    let tenantId = DEMO_TENANT_ID;
    let tenantRole: "admin" | "member" | null = null;
    let spaces: SpaceMembership[] = [];
    let activeSpaceId: string | null = null;

    if (tenantMember) {
      // Enterprise member
      tenantId = tenantMember.tenant_id;
      tenantRole = tenantMember.role as "admin" | "member";

      const { data: spaceMembers } = await supabase
        .from("space_members")
        .select("space_id, role, spaces(id, name, is_default)")
        .eq("user_id", user.id);

      if (spaceMembers) {
        spaces = spaceMembers.map((sm: any) => ({
          spaceId: sm.space_id,
          spaceName: sm.spaces?.name ?? "",
          role: sm.role as "admin" | "editor" | "viewer",
          isDefault: sm.spaces?.is_default ?? false,
        }));
      }

      activeSpaceId = user.active_space_id || spaces[0]?.spaceId || null;
    } else {
      // Personal user — ensure personal space exists
      const { data: spaceMembers } = await supabase
        .from("space_members")
        .select("space_id, role, spaces(id, name, is_default)")
        .eq("user_id", user.id);

      if (spaceMembers && spaceMembers.length > 0) {
        spaces = spaceMembers.map((sm: any) => ({
          spaceId: sm.space_id,
          spaceName: sm.spaces?.name ?? "",
          role: sm.role as "admin" | "editor" | "viewer",
          isDefault: sm.spaces?.is_default ?? false,
        }));
        activeSpaceId = user.active_space_id || spaces[0]?.spaceId || null;
      } else {
        // Legacy user with no personal space — create one
        const userName = user.display_name || user.email.split("@")[0];
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
            .insert({ space_id: personalSpace.id, user_id: user.id, role: "admin" });

          await supabase
            .from("users")
            .update({ active_space_id: personalSpace.id })
            .eq("id", user.id);

          spaces = [{ spaceId: personalSpace.id, spaceName: personalSpace.name, role: "admin", isDefault: false }];
          activeSpaceId = personalSpace.id;
        }
      }
    }

    const sessionUser: SessionUser = {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId,
      displayName: user.display_name,
      tenantRole,
      spaces,
      activeSpaceId,
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
