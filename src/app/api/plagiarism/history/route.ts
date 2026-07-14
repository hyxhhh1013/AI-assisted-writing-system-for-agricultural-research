import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getErrorMessage } from "@/lib/error-utils";
import { getUserIdFromRequest } from "@/lib/auth";
import { assertPlagiarismCheckOwnedByUser, assertProjectOwnedByUser } from "@/lib/plagiarism-access";

export async function GET(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return Response.json({ error: "未登录，请先登录" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const checkId = searchParams.get("checkId");
    const projectId = searchParams.get("projectId");
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 100);

    if (projectId) {
      const owned = await assertProjectOwnedByUser(projectId, userId);
      if (!owned) {
        return Response.json({ error: "项目不存在或无权访问" }, { status: 403 });
      }
    }

    if (checkId) {
      const allowed = await assertPlagiarismCheckOwnedByUser(checkId, userId);
      if (!allowed) {
        return Response.json({ error: "查重记录不存在或无权访问" }, { status: 404 });
      }

      const check = await prisma.plagiarismCheck.findUnique({
        where: { id: checkId },
        include: {
          matches: { orderBy: { similarity: "desc" }, take: 50 },
          _count: { select: { matches: true } },
        },
      });
      return Response.json({ check });
    }

    const checks = await prisma.plagiarismCheck.findMany({
      where: {
        project: { userId },
        ...(projectId ? { projectId } : {}),
      },
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
  } catch (error: unknown) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
