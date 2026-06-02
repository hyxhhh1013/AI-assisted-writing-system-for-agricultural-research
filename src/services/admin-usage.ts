import prisma from "@/lib/prisma";
import { usageLog, type UsageLogEntry } from "@/lib/usage-log";

export interface AiUsageDashboard {
  totalCalls: number;
  todayCount: number;
  weekCount: number;
  byFeature: Record<string, number>;
  topUsers: { userId: string; count: number }[];
}

let dbAvailable: boolean | null = null;

async function ensureDb(): Promise<boolean> {
  if (dbAvailable !== null) return dbAvailable;
  try {
    await prisma.aiUsageLog.count();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
  return dbAvailable;
}

export async function getUsageStats(): Promise<Record<string, number>> {
  if (!(await ensureDb())) return usageLog.stats();
  const rows = await prisma.aiUsageLog.groupBy({
    by: ["feature"],
    _count: { id: true },
  });
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.feature] = row._count.id;
  }
  return counts;
}

export async function getRecentLogs(n: number): Promise<UsageLogEntry[]> {
  if (!(await ensureDb())) return usageLog.recent(n);
  const rows = await prisma.aiUsageLog.findMany({
    take: n,
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    feature: row.feature,
    userId: row.userId ?? "anonymous",
    timestamp: row.createdAt.getTime(),
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
  }));
}

export async function getAiUsageDashboard(): Promise<AiUsageDashboard> {
  const byFeature = await getUsageStats();
  const totalCalls = Object.values(byFeature).reduce((sum, c) => sum + c, 0);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);

  if (!(await ensureDb())) {
    const recentAll = usageLog.recent(2000);
    const todayCount = recentAll.filter((e) => e.timestamp >= todayStart.getTime()).length;
    const weekCount = recentAll.filter((e) => e.timestamp >= weekStart.getTime()).length;
    const byUser: Record<string, { userId: string; count: number }> = {};
    for (const e of recentAll) {
      const uid = e.userId || "anonymous";
      if (!byUser[uid]) byUser[uid] = { userId: uid, count: 0 };
      byUser[uid].count++;
    }
    const topUsers = Object.values(byUser)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    return { totalCalls, todayCount, weekCount, byFeature, topUsers };
  }

  const [todayCount, weekCount, userGroups] = await Promise.all([
    prisma.aiUsageLog.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.aiUsageLog.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.aiUsageLog.groupBy({
      by: ["userId"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
  ]);

  const topUsers = userGroups.map((row) => ({
    userId: row.userId ?? "anonymous",
    count: row._count.id,
  }));

  return { totalCalls, todayCount, weekCount, byFeature, topUsers };
}

export async function getUserAiUsage(userId: string): Promise<{
  aiUsage: Record<string, number>;
  totalAiCalls: number;
}> {
  if (!(await ensureDb())) {
    const userRecent = usageLog.recent(500).filter((e) => e.userId === userId);
    const aiUsage: Record<string, number> = {};
    for (const e of userRecent) {
      aiUsage[e.feature] = (aiUsage[e.feature] || 0) + 1;
    }
    return { aiUsage, totalAiCalls: userRecent.length };
  }

  const rows = await prisma.aiUsageLog.groupBy({
    by: ["feature"],
    where: { userId },
    _count: { id: true },
  });
  const aiUsage: Record<string, number> = {};
  let totalAiCalls = 0;
  for (const row of rows) {
    aiUsage[row.feature] = row._count.id;
    totalAiCalls += row._count.id;
  }
  return { aiUsage, totalAiCalls };
}
