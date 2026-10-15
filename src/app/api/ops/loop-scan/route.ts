import { NextRequest } from "next/server";
import { scanOpsLoops } from "@/lib/ops-queries";
import { clampQueryInt, runOps } from "@/lib/ops-http";

export const dynamic = "force-dynamic";

/** GET /api/ops/loop-scan — 最近会话的空转病码统计。 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = clampQueryInt(searchParams.get("limit"), 20, 40);
  const days = clampQueryInt(searchParams.get("days"), 7, 30);
  return runOps(req, () => scanOpsLoops(limit, days));
}
