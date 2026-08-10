import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateBody } from "@/lib/api-validate";
import { projectChartsPatchSchema } from "@/lib/validations";
import { applyChartPatchOps } from "@/lib/project-charts";
import { parseProjectCharts, type ChartsPatchResponse } from "@/contracts/figure";

/** GET /api/projects/:id/charts — 图表资产列表（供 /plot 精修回放） */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const owned = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { charts: true },
    });
    if (!owned) return NextResponse.json({ error: "项目未找到" }, { status: 404 });

    const charts = parseProjectCharts(owned.charts);
    const { searchParams } = new URL(req.url);
    const assetId = searchParams.get("assetId")?.trim();
    const imageUrl = searchParams.get("imageUrl")?.trim();

    if (assetId) {
      const asset = charts.find((c) => c.id === assetId);
      if (!asset) {
        return NextResponse.json({ error: "图表资产不存在" }, { status: 404 });
      }
      return NextResponse.json({ charts: [asset], asset });
    }
    if (imageUrl) {
      const hits = charts.filter((c) => c.imageUrl === imageUrl);
      const asset = hits[hits.length - 1] ?? null;
      return NextResponse.json({
        charts: asset ? [asset] : [],
        asset,
      });
    }

    return NextResponse.json({ charts });
  } catch (error) {
    logger.error("Charts GET error:", error);
    return NextResponse.json({ error: "读取失败" }, { status: 500 });
  }
}

/** PATCH /api/projects/:id/charts — 图表资产 JSON 增量更新 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { data, errorResponse: ve } = await validateBody(
      projectChartsPatchSchema,
      await req.json(),
    );
    if (ve) return ve;

    const owned = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: "项目未找到" }, { status: 404 });

    const charts = await applyChartPatchOps(projectId, data.ops);

    await prisma.project.update({
      where: { id: projectId },
      data: { lastUpdated: new Date() },
    });

    const body: ChartsPatchResponse = { charts };
    return NextResponse.json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    if (message.includes("不存在")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    logger.error("Charts PATCH error:", error);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}
