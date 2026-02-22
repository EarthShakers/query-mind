import { supabase } from "@/lib/supabase";
import {
  hashPassword,
  createToken,
  buildSessionCookie,
  DEMO_TENANT_ID,
  DEMO_SPACE_ID,
  type SessionUser,
} from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { email, password, displayName } = await req.json();

    if (!email || !password) {
      return Response.json({ error: "邮箱和密码不能为空" }, { status: 400 });
    }

    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "邮箱格式不正确" }, { status: 400 });
    }

    if (typeof password !== "string" || password.length < 6) {
      return Response.json({ error: "密码长度至少 6 位" }, { status: 400 });
    }

    // Check if user already exists
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", email.toLowerCase())
      .single();

    if (existing) {
      return Response.json({ error: "该邮箱已注册" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);

    const { data: user, error } = await supabase
      .from("users")
      .insert({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        role: "user",
        tenant_id: DEMO_TENANT_ID,
        display_name: displayName || null,
      })
      .select("id, email, role, tenant_id, display_name")
      .single();

    if (error) throw new Error(error.message);

    // Create a personal space for the personal user
    const userName = displayName || email.split("@")[0];
    const { data: personalSpace, error: spaceError } = await supabase
      .from("spaces")
      .insert({
        tenant_id: DEMO_TENANT_ID,
        name: `${userName} 的个人空间`,
        is_default: false,
      })
      .select("id, name")
      .single();

    if (spaceError) throw new Error(spaceError.message);

    // Add user as admin of their personal space
    await supabase
      .from("space_members")
      .insert({ space_id: personalSpace.id, user_id: user.id, role: "admin" });

    // Set active_space_id to personal space
    await supabase
      .from("users")
      .update({ active_space_id: personalSpace.id })
      .eq("id", user.id);

    const sessionUser: SessionUser = {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: DEMO_TENANT_ID,
      displayName: user.display_name,
      tenantRole: null,
      spaces: [{ spaceId: personalSpace.id, spaceName: personalSpace.name, role: "admin", isDefault: false }],
      activeSpaceId: personalSpace.id,
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
