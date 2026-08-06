import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { success } from "@/lib/admin-response";
import { isAgentSessionSnapshot } from "@/contracts/agent-session";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/agent-sessions/stats — 会话深度分析
 * 全量聚合：总数 / 错误率 / 平均工具调用 / 平均迭代 + 按用户 Top 10。
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const rows = await prisma.agentSession.findMany({
    select: { userId: true, status: true, snapshot: true, updatedAt: true },
    orderBy: { createdAt: "desc" },
  });

  const total = rows.length;
  const errorCount = rows.filter((r) => r.status === "error").length;
  const enriched = rows.map((r) => ({
    userId: r.userId,
    status: r.status,
    updatedAt: r.updatedAt,
    snap: isAgentSessionSnapshot(r.snapshot) ? r.snapshot : null,
  }));

  const sumToolCalls = enriched.reduce((s, r) => s + (r.snap?.toolCallCount ?? 0), 0);
  const sumIterations = enriched.reduce((s, r) => s + (r.snap?.iteration ?? 0), 0);

  // 按用户聚合
  const byUserMap = new Map<string, {
    userId: string;
    sessionCount: number;
    errorCount: number;
    toolCalls: number;
    iterations: number;
    lastActive: number;
  }>();
  for (const r of enriched) {
    let u = byUserMap.get(r.userId);
    if (!u) {
      u = { userId: r.userId, sessionCount: 0, errorCount: 0, toolCalls: 0, iterations: 0, lastActive: 0 };
      byUserMap.set(r.userId, u);
    }
    u.sessionCount += 1;
    if (r.status === "error") u.errorCount += 1;
    u.toolCalls += r.snap?.toolCallCount ?? 0;
    u.iterations += r.snap?.iteration ?? 0;
    u.lastActive = Math.max(u.lastActive, r.updatedAt.getTime());
  }

  const userIds = [...byUserMap.keys()];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const nameMap = new Map(users.map((u) => [u.id, u.name]));

  const byUser = [...byUserMap.values()]
    .map((u) => ({
      userId: u.userId,
      userName: nameMap.get(u.userId) ?? undefined,
      sessionCount: u.sessionCount,
      errorCount: u.errorCount,
      errorRate: u.sessionCount ? Math.round((u.errorCount / u.sessionCount) * 100) : 0,
      avgToolCalls: u.sessionCount ? Math.round(u.toolCalls / u.sessionCount) : 0,
      avgIterations: u.sessionCount ? Math.round(u.iterations / u.sessionCount) : 0,
      lastActive: new Date(u.lastActive).toISOString(),
    }))
    .sort((a, b) => b.sessionCount - a.sessionCount)
    .slice(0, 10);

  return success({
    total,
    errorCount,
    errorRate: total ? Math.round((errorCount / total) * 100) : 0,
    avgToolCalls: total ? Math.round(sumToolCalls / total) : 0,
    avgIterations: total ? Math.round(sumIterations / total) : 0,
    byUser,
  });
}
