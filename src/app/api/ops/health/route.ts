import { NextRequest } from "next/server";
import { loadOpsHealth } from "@/lib/ops-queries";
import { runOps } from "@/lib/ops-http";

export const dynamic = "force-dynamic";

/** GET /api/ops/health — 数据库、进程、密钥是否在位、会话计数。 */
export async function GET(req: NextRequest) {
  return runOps(req, loadOpsHealth);
}
