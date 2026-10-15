import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api-validate";
import { requireOps } from "@/lib/ops-auth";
import { isOpsSessionId, opsJson } from "@/lib/ops-http";
import { getOpsSession, interruptOpsSession } from "@/lib/ops-queries";
import { appendOpsAudit } from "@/lib/ops-audit";

const interruptSchema = z.object({
  action: z.literal("interrupt"),
  confirm: z.literal(true),
});

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

/** GET /api/ops/sessions/:id — 截断后的对话尾部和工具轨迹。 */
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const denied = requireOps(req);
  if (denied) return denied;

  const { id } = await ctx.params;
  if (!isOpsSessionId(id)) {
    return NextResponse.json(
      { success: false, error: "会话 id 无效" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const session = await getOpsSession(id);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "会话不存在" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return opsJson(session);
  } catch {
    return NextResponse.json(
      { success: false, error: "运维查询失败" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

/** POST /api/ops/sessions/:id — 确认后把 running 会话标为 interrupted。 */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const denied = requireOps(req);
  if (denied) return denied;

  const { id } = await ctx.params;
  if (!isOpsSessionId(id)) {
    return NextResponse.json(
      { success: false, error: "会话 id 无效" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = await validateBody(interruptSchema, body);
  if (parsed.errorResponse) return parsed.errorResponse;

  try {
    const result = await interruptOpsSession(id);
    await appendOpsAudit({ action: "interrupt", ok: result.interrupted, target: id });
    if (!result.interrupted) {
      return NextResponse.json(
        { success: false, error: "会话不存在或不在运行中" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    return opsJson({ id, status: "interrupted" });
  } catch {
    return NextResponse.json(
      { success: false, error: "运维写入失败" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
