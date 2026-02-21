import { supabase } from "@/lib/supabase";
import {
  hashPassword,
  createToken,
  buildSessionCookie,
  type SessionUser,
} from "@/lib/auth";

const DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000000";

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

    const sessionUser: SessionUser = {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id,
      displayName: user.display_name,
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
