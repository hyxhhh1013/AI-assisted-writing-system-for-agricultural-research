import { NextResponse } from "next/server";

const RL_WINDOW_MS = 60_000;
/** 综述补文献会连续 search_external；开发放宽 */
const RL_MAX = process.env.NODE_ENV === "development" ? 60 : 20;
const store = new Map<string, { count: number; resetAt: number }>();

/** 外部文献检索限流（开发 60/分，生产 20/分） */
export function checkLiteratureRateLimit(userId: string): NextResponse | null {
  const now = Date.now();
  const entry = store.get(userId);
  if (!entry || now > entry.resetAt) {
    store.set(userId, { count: 1, resetAt: now + RL_WINDOW_MS });
    return null;
  }
  entry.count++;
  if (entry.count > RL_MAX) {
    return NextResponse.json(
      { error: "检索过于频繁，请稍后再试" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)) },
      },
    );
  }
  return null;
}
