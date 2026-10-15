import { NextRequest } from "next/server";
import { listOpsSessions } from "@/lib/ops-queries";
import { clampQueryInt, runOps } from "@/lib/ops-http";

export const dynamic = "force-dynamic";

/** GET /api/ops/sessions — 最近会话，goal / 状态 / 意图。 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return runOps(req, () =>
    listOpsSessions({
      status: searchParams.get("status") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      intentKind: searchParams.get("intentKind") ?? undefined,
      limit: clampQueryInt(searchParams.get("limit"), 10, 20),
    }),
  );
}
