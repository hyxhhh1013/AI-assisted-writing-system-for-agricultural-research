import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const checkId = searchParams.get("checkId");
    const projectId = searchParams.get("projectId");
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 100);

    // 单个检查详情
    if (checkId) {
      const check = await prisma.plagiarismCheck.findUnique({
        where: { id: checkId },
        include: {
          matches: { orderBy: { similarity: "desc" }, take: 50 },
          _count: { select: { matches: true } },
        },
      });
      return Response.json({ check });
    }

    // 历史列表
    const checks = await prisma.plagiarismCheck.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        maxSimilarity: true,
        overallRisk: true,
        _count: { select: { matches: true } },
      },
    });

    return Response.json({ checks });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
