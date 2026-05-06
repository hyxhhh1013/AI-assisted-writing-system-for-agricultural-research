import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET 环境变量未配置");
  return new TextEncoder().encode(secret);
};

const USER_ID_HEADER = "x-user-id";
const TOKEN_COOKIE = "token";

// 需要登录的路由
const protectedPages = ["/workbench", "/projects"];
const protectedApis = ["/api/projects", "/api/writing", "/api/analysis", "/api/outline", "/api/export"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(TOKEN_COOKIE)?.value;

  let userId: string | null = null;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, getJwtSecret());
      userId = (payload.sub as string) || null;
    } catch {
      userId = null;
    }
  }

  const isApiRoute = pathname.startsWith("/api/");
  const isProtectedPage = protectedPages.some((p) => pathname.startsWith(p));
  const isProtectedApi = protectedApis.some((p) => pathname.startsWith(p));

  // 受保护页面 — 未登录重定向到登录页
  if (isProtectedPage && !userId) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 受保护 API — 未登录返回 401
  if (isProtectedApi && !userId) {
    return NextResponse.json({ error: "未登录，请先登录" }, { status: 401 });
  }

  // 已登录用户，传递 userId 给 API Route
  const response = NextResponse.next();
  if (userId) {
    response.headers.set(USER_ID_HEADER, userId);
  }

  return response;
}

export const config = {
  matcher: [
    "/workbench/:path*",
    "/projects/:path*",
    "/api/projects/:path*",
    "/api/writing/:path*",
    "/api/analysis/:path*",
    "/api/outline/:path*",
    "/api/export/:path*",
  ],
};
