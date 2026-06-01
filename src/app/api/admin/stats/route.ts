import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { usageLog } from "@/lib/usage-log";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const [userCount, projectCount, knowledgeFileCount, knowledgeChunkCount, plagiarismCount, reviewCount] =
    await Promise.all([
      prisma.user.count(),
      prisma.project.count(),
      prisma.knowledgeFile.count(),
      prisma.knowledgeChunk.count(),
      prisma.plagiarismCheck.count(),
      prisma.reviewCheck.count(),
    ]);

  // 文献分类分布
  const filesByCategory = await prisma.knowledgeFile.groupBy({
    by: ["category"], _count: { id: true }, orderBy: { _count: { id: "desc" } },
  });

  // 项目模板分布
  const projectsByTemplate = await prisma.project.groupBy({
    by: ["template"], _count: { id: true },
  });

  // 最近 7 天新建项目数
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentProjects = await prisma.project.findMany({
    where: { createdAt: { gte: sevenDaysAgo } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const projectTrend: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const count = recentProjects.filter(p => p.createdAt.toISOString().slice(0, 10) === dateStr).length;
    projectTrend.push({ date: dateStr, count });
  }

  // 最近活动
  const recentActivity = await prisma.project.findMany({
    take: 5, orderBy: { lastUpdated: "desc" },
    select: { title: true, lastUpdated: true, owner: { select: { name: true } } },
  });

  // AI 用量统计
  const aiStats = usageLog.stats();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
  const todayCount = usageLog.recent(500).filter(e => e.timestamp >= todayStart.getTime()).length;
  const weekCount = usageLog.recent(500).filter(e => e.timestamp >= weekStart.getTime()).length;
  const totalAiCalls = Object.values(aiStats).reduce((s, c) => s + c, 0);

  // 按用户 AI 用量
  const recentAll = usageLog.recent(2000);
  const byUser: Record<string, { userId: string; count: number }> = {};
  for (const e of recentAll) {
    const uid = e.userId || "anonymous";
    if (!byUser[uid]) byUser[uid] = { userId: uid, count: 0 };
    byUser[uid].count++;
  }
  const topUsers = Object.values(byUser).sort((a, b) => b.count - a.count).slice(0, 10);

  return NextResponse.json({
    userCount, projectCount, knowledgeFileCount, knowledgeChunkCount, plagiarismCount, reviewCount,
    filesByCategory: filesByCategory.map(f => ({ category: f.category, count: f._count.id })),
    projectsByTemplate: projectsByTemplate.map(p => ({ template: p.template, count: p._count.id })),
    projectTrend,
    recentActivity: recentActivity.map(a => ({
      title: a.title, user: a.owner?.name ?? "未知", time: a.lastUpdated.toISOString(),
    })),
    aiUsage: { totalCalls: totalAiCalls, todayCount, weekCount, byFeature: aiStats, topUsers },
  });
}
