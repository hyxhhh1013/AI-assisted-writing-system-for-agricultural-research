import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { forwardRequestHeadersWithUserId } from "@/lib/auth";

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET 环境变量未配置");
  return new TextEncoder().encode(secret);
};

const TOKEN_COOKIE = "token";

/** 开发环境 AUTH_BYPASS 注入的固定用户（勿用于生产） */
const DEV_BYPASS_USER_ID = "cmotoc1u50000iey3u6ju4zia";

function isAuthBypassEnabled(): boolean {
  if (process.env.AUTH_BYPASS !== "true") return false;
  if (process.env.NODE_ENV === "production") {
    console.error("[proxy] AUTH_BYPASS 在生产环境无效，已忽略");
    return false;
  }
  return true;
}

function nextWithOptionalUserId(request: NextRequest, userId: string | null): NextResponse {
  return NextResponse.next({
    request: { headers: forwardRequestHeadersWithUserId(request.headers, userId) },
  });
}

// 需要登录的路由
const protectedPages = ["/workbench", "/projects"];
const protectedApis = [
  "/api/projects", "/api/writing", "/api/analysis", "/api/outline", "/api/export",
  "/api/plagiarism", "/api/chat", "/api/translate",
  "/api/consistency", "/api/chart", "/api/flow-diagram", "/api/mol-diagram",
  "/api/save-chart", "/api/references", "/api/literature", "/api/xrd", "/api/admin",
];

// AI 端点限流
const aiEndpoints = ["/api/writing", "/api/analysis", "/api/outline", "/api/chat", "/api/translate"];
const RL_WINDOW = 60_000;
const RL_MAX = 10;
const rlStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): NextResponse | null {
  const now = Date.now();
  const entry = rlStore.get(key);
  if (!entry || now > entry.resetAt) {
    rlStore.set(key, { count: 1, resetAt: now + RL_WINDOW });
    return null;
  }
  entry.count++;
  if (entry.count > RL_MAX) {
    return NextResponse.json(
      { success: false, error: "请求过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)) } }
    );
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let userId: string | null = null;

  if (isAuthBypassEnabled()) {
    userId = DEV_BYPASS_USER_ID;
  } else {
    const token = request.cookies.get(TOKEN_COOKIE)?.value;
    if (token) {
      try {
        const { payload } = await jwtVerify(token, getJwtSecret());
        userId = (payload.sub as string) || null;
      } catch {
        userId = null;
      }
    }
  }

  const isProtectedPage = protectedPages.some((p) => pathname.startsWith(p));
  // /api/knowledge、/api/pdf GET 公开读取；/api/knowledge/reindex 公开
  const isProtectedApi = protectedApis.some((p) => pathname.startsWith(p))
    || (pathname.startsWith("/api/knowledge") && request.method !== "GET" && !pathname.startsWith("/api/knowledge/reindex"))
    || (pathname.startsWith("/api/pdf") && request.method !== "GET");

  // AI 端点限流
  if (aiEndpoints.some((p) => pathname.startsWith(p))) {
    const limitKey = userId ?? request.headers.get("x-forwarded-for") ?? "anonymous";
    const rlResponse = checkRateLimit(limitKey);
    if (rlResponse) return rlResponse;
  }

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

  return nextWithOptionalUserId(request, userId);
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
    "/api/plagiarism/:path*",
    "/api/knowledge/:path*",
    "/api/chat/:path*",
    "/api/translate/:path*",
    "/api/consistency/:path*",
    "/api/chart/:path*",
    "/api/flow-diagram/:path*",
    "/api/mol-diagram/:path*",
    "/api/save-chart/:path*",
    "/api/references/:path*",
    "/api/literature/:path*",
    "/api/xrd/:path*",
    "/api/pdf/:path*",
    "/api/admin/:path*",
  ],
};
