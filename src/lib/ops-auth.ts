import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

const MIN_TOKEN_LENGTH = 24;
const WINDOW_MS = 60_000;
const MAX_HITS = 40;

const hits = new Map<string, { count: number; resetAt: number }>();

export function opsTokenConfigured(): boolean {
  return (process.env.OPS_MCP_TOKEN?.trim().length ?? 0) >= MIN_TOKEN_LENGTH;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function opsTokenMatches(presented: string, expected: string): boolean {
  return timingSafeEqual(digest(presented), digest(expected));
}

function tooMany(bucket: string): boolean {
  const now = Date.now();
  const entry = hits.get(bucket);
  if (!entry || now > entry.resetAt) {
    hits.set(bucket, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_HITS;
}

function opsError(error: string, status: number): NextResponse {
  return NextResponse.json(
    { success: false, error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * 运维接口鉴权。未配置足够长的 OPS_MCP_TOKEN 时关闭接口。
 * 通过返回 null。
 */
export function requireOps(req: { headers: { get: (name: string) => string | null } }): NextResponse | null {
  const expected = process.env.OPS_MCP_TOKEN?.trim() ?? "";
  if (expected.length < MIN_TOKEN_LENGTH) {
    return opsError("运维接口未启用", 503);
  }

  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  const bucket = presented ? digest(presented).toString("hex").slice(0, 16) : "anon";
  if (tooMany(bucket)) {
    return opsError("请求过于频繁", 429);
  }
  if (!presented || !opsTokenMatches(presented, expected)) {
    return opsError("未授权", 401);
  }
  return null;
}

/** 测试用：清空内存限流。 */
export function resetOpsRateLimit(): void {
  hits.clear();
}
