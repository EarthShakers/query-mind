import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // 防止页面被嵌入 iframe（点击劫持）
  res.headers.set("X-Frame-Options", "DENY");

  // 禁止浏览器猜测 MIME 类型
  res.headers.set("X-Content-Type-Options", "nosniff");

  // 控制 Referrer 信息泄露
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // 基础 CSP：限制脚本只能来自同源和 inline（Next.js 需要）
  res.headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'none'; base-uri 'self';"
  );

  return res;
}

export const config = {
  // 对所有页面和 API 生效，排除静态资源
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
