import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "qm_session";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

// 安全策略：设置 HTTP 响应头
function applySecurityHeaders(res: NextResponse, pathname?: string) {
  const allowGameEmbed =
    pathname?.startsWith("/games/") || pathname?.startsWith("/api/spark/public/");

  if (allowGameEmbed) {
    res.headers.set("X-Frame-Options", "SAMEORIGIN");
    res.headers.set(
      "Content-Security-Policy",
      "frame-ancestors 'self'; base-uri 'self';"
    );
  } else {
    res.headers.set("X-Frame-Options", "DENY");
    res.headers.set(
      "Content-Security-Policy",
      "frame-ancestors 'none'; base-uri 'self';"
    );
  }
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  applySecurityHeaders(res, req.nextUrl.pathname);

  // Parse JWT and inject user info into request headers
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const secret = getSecret();
  let userId: string | null = null;
  let userRole: string | null = null;
  let tenantId: string | null = null;
  let tenantRole: string | null = null;
  let activeSpaceId: string | null = null;
  let spaceRole: string | null = null;

  if (token && secret) {
    try {
      const { payload } = await jwtVerify(token, secret);
      userId = (payload as any).userId ?? null;
      userRole = (payload as any).role ?? null;
      tenantId = (payload as any).tenantId ?? null;
      tenantRole = (payload as any).tenantRole ?? null;
      activeSpaceId = (payload as any).activeSpaceId ?? null;

      // Resolve spaceRole from the spaces array in JWT
      const spaces = (payload as any).spaces as
        | { spaceId: string; role: string }[]
        | undefined;
      if (activeSpaceId && spaces) {
        const match = spaces.find((s) => s.spaceId === activeSpaceId);
        if (match) spaceRole = match.role;
      }
    } catch {
      // Invalid token — treat as anonymous
    }
  }

  const isTenantAdmin = tenantRole === "admin";
  const isSuperAdmin = userRole === "superAdmin";
  const pathname = req.nextUrl.pathname;

  // Inject user context headers for downstream API routes
  if (userId) {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-user-id", userId);
    requestHeaders.set("x-user-role", userRole!);
    requestHeaders.set("x-tenant-id", tenantId!);
    if (tenantRole) requestHeaders.set("x-tenant-role", tenantRole);
    if (activeSpaceId) requestHeaders.set("x-active-space-id", activeSpaceId);
    if (spaceRole) requestHeaders.set("x-space-role", spaceRole);

    const rewriteRes = NextResponse.next({
      request: { headers: requestHeaders },
    });
    applySecurityHeaders(rewriteRes, pathname);

    // Route protection for logged-in users
    if (pathname === "/login" || pathname === "/register") {
      return NextResponse.redirect(new URL("/", req.url));
    }
    // /docs/* requires super admin (role: "admin")
    if (pathname.startsWith("/docs") && !isSuperAdmin) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    // /admin/models requires super admin; other /admin/* requires tenant admin
    if (pathname.startsWith("/admin/models")) {
      if (!isSuperAdmin) {
        return NextResponse.redirect(new URL("/", req.url));
      }
    } else if (pathname.startsWith("/admin") && !isTenantAdmin) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    return rewriteRes;
  }

  // Anonymous route protection
  if (pathname.startsWith("/docs")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (pathname === "/profile") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (pathname.startsWith("/spaces")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (pathname.startsWith("/admin")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (pathname === "/join") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
