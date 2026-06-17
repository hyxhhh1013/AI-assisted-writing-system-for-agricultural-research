import { randomUUID } from "crypto";
import type { ChartPatchOp, ProjectChartAsset } from "@/contracts/figure";
import { parseProjectCharts, serializeProjectCharts } from "@/contracts/figure";
import prisma from "@/lib/prisma";

export async function applyChartPatchOps(
  projectId: string,
  ops: ChartPatchOp[],
): Promise<ProjectChartAsset[]> {
  const project = await prisma.project.findFirst({
    where: { id: projectId },
    select: { charts: true },
  });
  if (!project) {
    throw new Error("项目未找到");
  }

  let assets = parseProjectCharts(project.charts);

  for (const op of ops) {
    if (op.op === "append") {
      const next: ProjectChartAsset = {
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
      assets = [...assets, next];
      continue;
    }

    if (op.op === "delete") {
      const before = assets.length;
      assets = assets.filter((a) => a.id !== op.id);
      if (assets.length === before) {
        throw new Error(`图表资产不存在: ${op.id}`);
      }
    }
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { charts: serializeProjectCharts(assets) },
  });

  return assets;
}
