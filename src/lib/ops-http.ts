import { NextResponse } from "next/server";
import { requireOps } from "@/lib/ops-auth";

export function opsJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json(
    { success: true, data },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function runOps(
  req: { headers: { get: (name: string) => string | null } },
  load: () => Promise<unknown>,
): Promise<NextResponse> {
  const denied = requireOps(req);
  if (denied) return denied;
  try {
    return opsJson(await load());
  } catch {
    return NextResponse.json(
      { success: false, error: "运维查询失败" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export function clampQueryInt(raw: string | null, fallback: number, max: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return fallback;
  return Math.min(value, max);
}

const SESSION_ID = /^[a-zA-Z0-9_-]{8,40}$/;

export function isOpsSessionId(id: string): boolean {
  return SESSION_ID.test(id);
}
