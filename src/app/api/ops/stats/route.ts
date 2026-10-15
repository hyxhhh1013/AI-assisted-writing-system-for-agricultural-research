import { NextRequest } from "next/server";
import { loadOpsStats } from "@/lib/ops-queries";
import { runOps } from "@/lib/ops-http";

export const dynamic = "force-dynamic";

/** GET /api/ops/stats — 用户、项目、文献、会话计数。 */
export async function GET(req: NextRequest) {
  return runOps(req, loadOpsStats);
}
