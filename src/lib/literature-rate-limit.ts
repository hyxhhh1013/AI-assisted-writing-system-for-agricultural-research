import { NextResponse } from "next/server";

const RL_WINDOW_MS = 60_000;
const RL_MAX = 10;
const store = new Map<string, { count: number; resetAt: number }>();

/** 外部文献检索：每用户 10 次/分钟 */
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
