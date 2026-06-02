import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateBody } from "@/lib/api-validate";
import { projectAnalysisResultsPatchSchema } from "@/lib/validations";
import { applyAnalysisResultPatchOps } from "@/lib/project-analysis-results";
import type { AnalysisResultsPatchResponse } from "@/contracts/project";

/** PATCH /api/projects/:id/analysis-results — 分析结果行级增量更新 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { data, errorResponse: ve } = await validateBody(
      projectAnalysisResultsPatchSchema,
      await req.json(),
    );
    if (ve) return ve;

    const owned = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: "项目未找到" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await applyAnalysisResultPatchOps(tx, projectId, data.ops);
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { lastUpdated: new Date() },
    });

    const rows = await prisma.analysisResult.findMany({
      where: { projectId },
      orderBy: { id: "asc" },
      select: { id: true, content: true },
    });

    const body: AnalysisResultsPatchResponse = { analysisResults: rows };
    return NextResponse.json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    if (message.includes("不存在")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    logger.error("AnalysisResults PATCH error:", error);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}
