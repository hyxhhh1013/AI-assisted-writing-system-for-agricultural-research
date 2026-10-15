import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api-validate";
import { requireOps } from "@/lib/ops-auth";
import { opsJson } from "@/lib/ops-http";
import { appendOpsAudit } from "@/lib/ops-audit";
import { startOpsReindex } from "@/lib/ops-reindex";

export const dynamic = "force-dynamic";

const reindexSchema = z.object({
  confirm: z.literal(true),
});

/** POST /api/ops/reindex — 确认后在深夜窗口启动全库 --rechunk。 */
export async function POST(req: NextRequest) {
  const denied = requireOps(req);
  if (denied) return denied;

  const body: unknown = await req.json().catch(() => null);
  const parsed = await validateBody(reindexSchema, body);
  if (parsed.errorResponse) return parsed.errorResponse;

  const result = startOpsReindex();
  await appendOpsAudit({
    action: "reindex",
    ok: result.started || result.running,
    detail: result.reason ?? (result.pid ? `pid ${result.pid}` : undefined),
  });
  if (!result.started && !result.running) {
    return NextResponse.json(
      { success: false, error: result.reason ?? "未能启动重切" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  return opsJson(result);
}
