import { getOrCreateTempSpace } from "@/lib/temp-space";

export async function GET(req: Request) {
  try {
    // Check if user is logged in — logged-in users don't need temp spaces
    const userId = req.headers.get("x-user-id");
    if (userId) {
      return Response.json(
        { error: "已登录用户不需要临时空间" },
        { status: 400 }
      );
    }

    // Read existing cookie
    const cookieHeader = req.headers.get("cookie") || "";
    const match = cookieHeader.match(/qm_temp_space=([^;]+)/);
    const existingValue = match ? match[1] : null;

    const { spaceId, setCookie } = await getOrCreateTempSpace(existingValue);

    const headers: Record<string, string> = {};
    if (setCookie) {
      headers["Set-Cookie"] = setCookie;
    }

    return Response.json({ spaceId }, { headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
