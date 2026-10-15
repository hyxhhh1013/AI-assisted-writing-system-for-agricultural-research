import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api-validate";
import { requireOps } from "@/lib/ops-auth";
import { opsJson } from "@/lib/ops-http";
import { appendOpsAudit } from "@/lib/ops-audit";
import { classifyOpsSql } from "@/lib/ops-sql";
import { OpsSqlRejected, runOpsSql } from "@/lib/ops-sql-run";
import { redactOpsLogLine } from "@/lib/ops-logs";

export const dynamic = "force-dynamic";

const sqlSchema = z.object({
  sql: z.string().min(1).max(8000),
  confirm: z.boolean().optional(),
});

/** POST /api/ops/sql — 一条 SQL。读语句直接执行；写语句必须 confirm。 */
export async function POST(req: NextRequest) {
  const denied = requireOps(req);
  if (denied) return denied;

  const body: unknown = await req.json().catch(() => null);
  const parsed = await validateBody(sqlSchema, body);
  if (parsed.errorResponse) return parsed.errorResponse;

  const kind = classifyOpsSql(parsed.data.sql);
  if (kind === "write" && parsed.data.confirm !== true) {
    await appendOpsAudit({ action: "sql", ok: false, detail: "未确认的写语句" });
    return NextResponse.json(
      { success: false, error: "写语句需要 confirm: true" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await runOpsSql(parsed.data.sql);
    await appendOpsAudit({
      action: "sql",
      ok: true,
      detail: `${result.kind} ${parsed.data.sql.trim().slice(0, 180)}`,
    });
    return opsJson(result);
  } catch (err) {
    const message = err instanceof OpsSqlRejected
      ? err.message
      : redactOpsLogLine(err instanceof Error ? err.message : "SQL 执行失败").slice(0, 300);
    await appendOpsAudit({
      action: "sql",
      ok: false,
      detail: `${message}: ${parsed.data.sql.trim().slice(0, 160)}`,
    });
    const status = err instanceof OpsSqlRejected ? 400 : 500;
    return NextResponse.json(
      { success: false, error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
