import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ChartPatchOp, ProjectChartAsset } from "@/contracts/figure";
import { parseProjectCharts, serializeProjectCharts } from "@/contracts/figure";
import prisma from "@/lib/prisma";
import { getChartsDir } from "@/lib/charts-dir";

/** 删除图表对应的磁盘文件（png/svg/pdf），失败静默 */
function deleteChartFiles(urls: Array<string | undefined>): void {
  for (const url of urls) {
    if (!url) continue;
    const name = url.split("/").pop();
    if (!name || !/^[0-9a-f-]{8,}\.(png|svg|pdf)$/i.test(name)) continue;
    const fp = path.join(getChartsDir(), name);
    try {
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch {
      /* ignore */
    }
  }
}

function applyOpsToChartAssets(
  assets: ProjectChartAsset[],
  ops: ChartPatchOp[],
): { next: ProjectChartAsset[]; deleted: ProjectChartAsset[] } {
  let next = assets;
  const deleted: ProjectChartAsset[] = [];

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
      const victim = next.find((a) => a.id === op.id);
      next = next.filter((a) => a.id !== op.id);
      if (!victim) {
        throw new Error(`图表资产不存在: ${op.id}`);
      }
      deleted.push(victim);
    }
  }

  return { next, deleted };
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

    const { next, deleted } = applyOpsToChartAssets(
      parseProjectCharts(rows[0].charts),
      ops,
    );

    await tx.project.update({
      where: { id: projectId },
      data: { charts: serializeProjectCharts(next) },
    });

    // 删除图表资产时同步清理磁盘文件，避免孤儿图堆积
    for (const a of deleted) {
      deleteChartFiles([a.imageUrl, a.svgUrl, a.pdfUrl]);
    }

    return next;
  });
}

/** 扫描所有项目引用的图表文件，删除 data/charts 中无引用的孤儿文件 */
export async function cleanupOrphanCharts(): Promise<number> {
  const projects = await prisma.project.findMany({ select: { charts: true } });
  const referenced = new Set<string>();
  for (const p of projects) {
    for (const a of parseProjectCharts(p.charts)) {
      for (const url of [a.imageUrl, a.svgUrl, a.pdfUrl]) {
        const name = url?.split("/").pop();
        if (name) referenced.add(name);
      }
    }
  }
  let removed = 0;
  const chartsDir = getChartsDir();
  if (!fs.existsSync(chartsDir)) return 0;
  for (const f of fs.readdirSync(chartsDir)) {
    if (!referenced.has(f) && /^[0-9a-f-]{8,}\.(png|svg|pdf)$/i.test(f)) {
      try {
        fs.unlinkSync(path.join(chartsDir, f));
        removed++;
      } catch {
        /* ignore */
      }
    }
  }
  return removed;
}

/** @internal 单测用 */
export function applyChartPatchOpsInMemory(
  assets: ProjectChartAsset[],
  ops: ChartPatchOp[],
): ProjectChartAsset[] {
  return applyOpsToChartAssets(assets, ops).next;
}
