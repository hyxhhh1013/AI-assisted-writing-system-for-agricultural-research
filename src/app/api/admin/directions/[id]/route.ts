import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { success, notFound, badRequest } from "@/lib/admin-response";
import { parseDirectionLiteratureState } from "@/contracts/direction-literature";
import type { DirectionAnalysis, DirectionAsset, DirectionRoadmap } from "@/contracts/direction";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

/** GET — 方向详情（资产 / 文献语料 / 分析 / 路线图） */
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const { error } = await requireAdmin(req);
  if (error) return error;

  const row = await prisma.direction.findUnique({
    where: { id },
    include: { user: { select: { name: true } } },
  });
  if (!row) return notFound("方向不存在");

  const lit = parseDirectionLiteratureState(row.literatureCorpus);
  return success({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    categories: row.categories ?? [],
    status: row.status as "active" | "archived",
    userId: row.userId,
    userName: row.user?.name ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    assets: Array.isArray(row.assets) ? (row.assets as unknown as DirectionAsset[]) : [],
    literatureEntries: lit.entries,
    literatureConfirmedAt: lit.confirmedAt ?? null,
    analysis: row.analysis as DirectionAnalysis | null,
    roadmap: row.roadmap as DirectionRoadmap | null,
  });
}

/** PATCH — 切换方向 active ↔ archived */
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (status !== "active" && status !== "archived") {
    return badRequest("status 仅支持 active / archived");
  }

  const result = await prisma.direction.updateMany({ where: { id }, data: { status } });
  if (result.count === 0) return notFound("方向不存在");
  return success(undefined, status === "active" ? "已启用" : "已归档");
}
