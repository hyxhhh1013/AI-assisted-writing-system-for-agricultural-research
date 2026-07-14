import prisma from "@/lib/prisma";
import { usageLog, type UsageLogEntry } from "@/lib/usage-log";
import type { AdminUsageTrendPoint, AdminUsageTrends } from "@/contracts/admin";

export interface AiUsageDashboard {
  totalCalls: number;
  todayCount: number;
  weekCount: number;
  byFeature: Record<string, number>;
  topUsers: { userId: string; userName?: string; count: number }[];
}

async function resolveUserLabels(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter((id) => id && id !== "anonymous"))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true },
  });
  return new Map(users.map((u) => [u.id, `${u.name} (${u.email})`]));
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
  const userIds = rows.map((r) => r.userId).filter((id): id is string => Boolean(id));
  const labels = await resolveUserLabels(userIds);
  return rows.map((row) => ({
    feature: row.feature,
    userId: row.userId ?? "anonymous",
    userLabel: row.userId ? labels.get(row.userId) ?? row.userId : "匿名",
    timestamp: row.createdAt.getTime(),
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
  }));
}

function aggregateDailyTrend(rows: { createdAt: Date }[], days: number): AdminUsageTrendPoint[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const map = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    map.set(d.toISOString().slice(0, 10), 0);
  }

  for (const row of rows) {
    const key = row.createdAt.toISOString().slice(0, 10);
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
  }

  return [...map.entries()].map(([date, count]) => ({ date, count }));
}

function aggregateWeeklyTrend(rows: { createdAt: Date }[], weeks: number): AdminUsageTrendPoint[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const day = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - day);

  const buckets: AdminUsageTrendPoint[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const start = new Date(weekStart);
    start.setDate(weekStart.getDate() - w * 7);
    buckets.push({ date: start.toISOString().slice(0, 10), count: 0 });
  }

  for (const row of rows) {
    const ts = row.createdAt.getTime();
    for (let i = buckets.length - 1; i >= 0; i--) {
      const start = new Date(buckets[i].date).getTime();
      const end = i < buckets.length - 1
        ? new Date(buckets[i + 1].date).getTime()
        : ts + 1;
      if (ts >= start && ts < end) {
        buckets[i].count++;
        break;
      }
    }
  }

  return buckets;
}

export async function getUsageTrends(range: "30d" | "12w"): Promise<AdminUsageTrends> {
  const days = range === "12w" ? 84 : 30;
  const start = new Date();
  start.setDate(start.getDate() - days);

  if (!(await ensureDb())) {
    const recent = usageLog.recent(5000).filter((e) => e.timestamp >= start.getTime());
    const rows = recent.map((e) => ({ createdAt: new Date(e.timestamp) }));
    return {
      range,
      points: range === "12w"
        ? aggregateWeeklyTrend(rows, 12)
        : aggregateDailyTrend(rows, 30),
    };
  }

  const rows = await prisma.aiUsageLog.findMany({
    where: { createdAt: { gte: start } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return {
    range,
    points: range === "12w"
      ? aggregateWeeklyTrend(rows, 12)
      : aggregateDailyTrend(rows, 30),
  };
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

  const labels = await resolveUserLabels(topUsers.map((u) => u.userId));
  const enrichedTopUsers = topUsers.map((u) => ({
    ...u,
    userName: labels.get(u.userId) ?? (u.userId === "anonymous" ? "匿名" : u.userId),
  }));

  return { totalCalls, todayCount, weekCount, byFeature, topUsers: enrichedTopUsers };
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
