import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { success, notFound } from "@/lib/admin-response";
import { usageLog } from "@/lib/usage-log";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin(_req);
  if (error) return error;

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  if (!user) return notFound("用户不存在");

  const projects = await prisma.project.findMany({
    where: { userId: id },
    select: {
      id: true, title: true, template: true, mode: true,
      lastUpdated: true, createdAt: true,
      _count: { select: { sections: true, references: true } },
    },
    orderBy: { lastUpdated: "desc" },
  });

  // 该用户的 AI 用量
  const allStats = usageLog.stats();
  const userRecent = usageLog.recent(500).filter(e => e.userId === id);
  const userFeatureCounts: Record<string, number> = {};
  for (const e of userRecent) {
    userFeatureCounts[e.feature] = (userFeatureCounts[e.feature] || 0) + 1;
  }

  return success({
    ...user,
    createdAt: user.createdAt.toISOString(),
    projects: projects.map(p => ({
      ...p,
      lastUpdated: p.lastUpdated.toISOString(),
      createdAt: p.createdAt.toISOString(),
      sectionCount: p._count.sections,
      referenceCount: p._count.references,
    })),
    aiUsage: userFeatureCounts,
    totalAiCalls: userRecent.length,
  });
}
