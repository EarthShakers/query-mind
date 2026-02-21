import { supabase } from "@/lib/supabase";
import {
  verifyPassword,
  createToken,
  buildSessionCookie,
  type SessionUser,
} from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return Response.json({ error: "邮箱和密码不能为空" }, { status: 400 });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, password_hash, role, tenant_id, display_name")
      .eq("email", email.toLowerCase())
      .single();

    if (error || !user) {
      return Response.json({ error: "邮箱或密码错误" }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return Response.json({ error: "邮箱或密码错误" }, { status: 401 });
    }

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
