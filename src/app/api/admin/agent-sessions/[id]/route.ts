import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { success, notFound, badRequest } from "@/lib/admin-response";
import { isAgentSessionSnapshot } from "@/contracts/agent-session";
import { normalizeUiTranscript } from "@/lib/agent/ui-transcript";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

/** GET — 会话详情（含快照概要） */
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const { error } = await requireAdmin(req);
  if (error) return error;

  const row = await prisma.agentSession.findUnique({
    where: { id },
    include: { user: { select: { name: true } } },
  });
  if (!row) return notFound("会话不存在");

  let projectTitle: string | null = null;
  if (row.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: row.projectId },
      select: { title: true },
    });
    projectTitle = project?.title ?? null;
  }

  const snap = isAgentSessionSnapshot(row.snapshot) ? row.snapshot : null;
  const transcript = snap?.uiTranscript ? normalizeUiTranscript(snap.uiTranscript) : [];
  const lastSummary = [...transcript].reverse().find((m) => m.kind === "summary");
  return success({
    id: row.id,
    userId: row.userId,
    userName: row.user?.name ?? undefined,
    projectId: row.projectId,
    projectTitle,
    directionSlug: row.directionSlug,
    goal: row.goal,
    status: row.status as "running" | "interrupted" | "completed" | "error",
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    iteration: snap?.iteration ?? 0,
    toolCallCount: snap?.toolCallCount ?? 0,
    uiTranscript: transcript,
    plan: snap?.plan ?? null,
    error: snap?.error ?? null,
    summary: lastSummary?.kind === "summary" ? lastSummary.summary : null,
  });
}

/** PATCH — 强制中断 running 会话（status → interrupted） */
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (body?.action !== "interrupt") return badRequest("仅支持 action=interrupt");

  const result = await prisma.agentSession.updateMany({
    where: { id, status: "running" },
    data: { status: "interrupted", errorMessage: "管理员强制中断" },
  });
  if (result.count === 0) return badRequest("会话不存在或不在运行中");
  return success(undefined, "已强制中断");
}
