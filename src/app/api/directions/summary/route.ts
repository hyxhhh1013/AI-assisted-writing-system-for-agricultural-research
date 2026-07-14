import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/error-utils";
import { requireDirectionUser } from "@/lib/direction-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/directions/summary
 * 返回当前用户方向概览摘要
 */
export async function GET(req: NextRequest) {
  try {
    const auth = requireDirectionUser(req);
    if (!auth.ok) return auth.response;

    const rows = await prisma.direction.findMany({
      where: { status: "active", userId: auth.userId },
      orderBy: { updatedAt: "desc" },
      select: {
        slug: true,
        name: true,
        description: true,
        categories: true,
        assets: true,
        analysis: true,
        roadmap: true,
        updatedAt: true,
      },
    });

    const items = rows.map((row) => {
      const assets = Array.isArray(row.assets) ? row.assets : [];
      const analysis = row.analysis as Record<string, unknown> | null;
      const roadmap = row.roadmap as Record<string, unknown> | null;
      const dims = analysis?.dimensions as Array<Record<string, unknown>> | undefined;
      const papers = (roadmap?.papers as Array<Record<string, unknown>>) || [];
      const candidates = (analysis?.paperCandidates as Array<Record<string, unknown>>) || [];

      return {
        slug: row.slug,
        name: row.name,
        description: row.description,
        categories: row.categories,
        assetCount: assets.length,
        analysisDone: !!(dims && dims.length > 0),
        analysisScore:
          dims && dims.length > 0
            ? Math.round(
                (dims.reduce((sum, d) => sum + ((d.score as number) || 0), 0) / dims.length) * 10,
              ) / 10
            : null,
        paperCounts: {
          total: papers.length,
          planned: papers.filter((p) => p.status === "planned").length,
          writing: papers.filter((p) => p.status === "writing").length,
          submitted: papers.filter((p) => p.status === "submitted").length,
          published: papers.filter((p) => p.status === "published").length,
        },
        readyCount: candidates.filter((c) => c.tier === "ready").length,
        updatedAt: row.updatedAt.getTime(),
      };
    });

    return NextResponse.json({ items });
  } catch (error: unknown) {
    logger.fail("direction summary failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "获取方向摘要失败" },
      { status: 500 },
    );
  }
}
