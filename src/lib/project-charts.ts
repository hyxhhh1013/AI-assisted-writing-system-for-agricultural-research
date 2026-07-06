import { randomUUID } from "crypto";
import type { ChartPatchOp, ProjectChartAsset } from "@/contracts/figure";
import { parseProjectCharts, serializeProjectCharts } from "@/contracts/figure";
import prisma from "@/lib/prisma";

function applyOpsToChartAssets(
  assets: ProjectChartAsset[],
  ops: ChartPatchOp[],
): ProjectChartAsset[] {
  let next = assets;

  for (const op of ops) {
    if (op.op === "append") {
      const item: ProjectChartAsset = {
        id: op.asset.id ?? randomUUID(),
        figureId: op.asset.figureId,
        caption: op.asset.caption,
        imageUrl: op.asset.imageUrl,
        svgUrl: op.asset.svgUrl,
        pdfUrl: op.asset.pdfUrl,
        sectionKey: op.asset.sectionKey,
        figureSpecEnc: op.asset.figureSpecEnc,
        createdAt: Date.now(),
      };
      next = [...next, item];
      continue;
    }

    if (op.op === "delete") {
      const before = next.length;
      next = next.filter((a) => a.id !== op.id);
      if (next.length === before) {
        throw new Error(`图表资产不存在: ${op.id}`);
      }
    }
  }

  return next;
}

export async function applyChartPatchOps(
  projectId: string,
  ops: ChartPatchOp[],
): Promise<ProjectChartAsset[]> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ charts: string | null }>>`
      SELECT charts FROM "Project" WHERE id = ${projectId} FOR UPDATE
    `;
    if (!rows[0]) {
      throw new Error("项目未找到");
    }

    const assets = applyOpsToChartAssets(parseProjectCharts(rows[0].charts), ops);

    await tx.project.update({
      where: { id: projectId },
      data: { charts: serializeProjectCharts(assets) },
    });

    return assets;
  });
}

/** @internal 单测用 */
export function applyChartPatchOpsInMemory(
  assets: ProjectChartAsset[],
  ops: ChartPatchOp[],
): ProjectChartAsset[] {
  return applyOpsToChartAssets(assets, ops);
}
