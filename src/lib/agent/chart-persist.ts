import type { ProjectChartAsset } from "@/contracts/figure";
import { applyChartPatchOps } from "@/lib/project-charts";
import prisma from "@/lib/prisma";

/** Agent generate_chart：追加图表资产到 Project.charts */
export async function persistAgentChart(
  userId: string,
  projectId: string,
  asset: Omit<ProjectChartAsset, "id" | "createdAt">,
): Promise<ProjectChartAsset> {
  const owned = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!owned) {
    throw new Error("项目不存在或无权访问");
  }

  const assets = await applyChartPatchOps(projectId, [{ op: "append", asset }]);
  const created = assets[assets.length - 1];
  if (!created) {
    throw new Error("图表资产写入失败");
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { lastUpdated: new Date() },
  });

  return created;
}
