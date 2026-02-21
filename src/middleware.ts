import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "qm_session";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Security headers
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'none'; base-uri 'self';"
  );

  // Parse JWT and inject user info into request headers
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const secret = getSecret();
  let userId: string | null = null;
  let userRole: string | null = null;
  let tenantId: string | null = null;

  if (token && secret) {
    try {
      const { payload } = await jwtVerify(token, secret);
      userId = (payload as any).userId ?? null;
      userRole = (payload as any).role ?? null;
      tenantId = (payload as any).tenantId ?? null;
    } catch {
      // Invalid token — treat as anonymous
    }
  }

  const isLoggedIn = !!userId;
  const isAdmin = userRole === "admin";
  const pathname = req.nextUrl.pathname;

  // Inject user context headers for downstream API routes
  if (userId) {
    res.headers.set("x-user-id", userId);
    res.headers.set("x-user-role", userRole!);
    res.headers.set("x-tenant-id", tenantId!);
    // Also set on the request for API routes to read
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-user-id", userId);
    requestHeaders.set("x-user-role", userRole!);
    requestHeaders.set("x-tenant-id", tenantId!);

    const rewriteRes = NextResponse.next({
      request: { headers: requestHeaders },
    });
    // Copy security headers to the rewritten response
    rewriteRes.headers.set("X-Frame-Options", "DENY");
    rewriteRes.headers.set("X-Content-Type-Options", "nosniff");
    rewriteRes.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    rewriteRes.headers.set(
      "Content-Security-Policy",
      "frame-ancestors 'none'; base-uri 'self';"
    );

    // Route protection for logged-in users
    if (pathname === "/login" || pathname === "/register") {
      return NextResponse.redirect(new URL("/", req.url));
    }
    if (pathname.startsWith("/docs") && !isAdmin) {
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

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
