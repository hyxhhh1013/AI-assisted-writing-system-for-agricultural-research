/**
 * 方向评分标准校准 — 从历史成功论文中学习
 *
 * 借鉴 academic-paper v2.5 Style Calibration 模式
 * 分析方向已有的已发表论文特征，用于校准 D4/D5/D7 评分的期望值
 */

import prisma from "@/lib/prisma";
import type { DirectionAsset } from "@/contracts/direction";

export interface CalibrationResult {
  /** 已发表论文数量 */
  publishedCount: number;
  /** 平均 IF */
  avgIF: number | null;
  /** 最高 IF */
  maxIF: number | null;
  /** 期刊列表 */
  journals: string[];
  /** 对 Rubric 的调整建议 */
  rubricAdjustments: string[];
  /** 用于预承诺对话的自然语言摘要 */
  summary: string;
}

/**
 * 分析方向下已发表的论文资产，产出校准建议
 */
export async function calibrateFromPublishedPapers(
  assets: DirectionAsset[],
  directionSlug: string,
): Promise<CalibrationResult> {
  const papers = assets.filter((a) => a.kind === "paper");
  const withIF = papers
    .map((a) => (a as { impactFactor?: number }).impactFactor)
    .filter((v): v is number => v != null && v > 0);

  const journals = papers
    .map((a) => (a as { journal?: string }).journal)
    .filter((v): v is string => !!v);

  const avgIF = withIF.length > 0
    ? Math.round((withIF.reduce((s, v) => s + v, 0) / withIF.length) * 10) / 10
    : null;
  const maxIF = withIF.length > 0 ? Math.max(...withIF) : null;

  // 基于已发表论文特征生成 Rubric 调整建议
  const adjustments: string[] = [];

  if (avgIF && avgIF >= 5) {
    adjustments.push(
      `该方向已发表论文平均 IF=${avgIF}，建议 D7 创新性检查项设置更高门槛——要求新论文的发现必须达到同层次期刊的创新水平。`,
    );
  } else if (avgIF && avgIF < 3) {
    adjustments.push(
      `该方向已发表论文平均 IF=${avgIF}（偏低），建议 D4 数据质量检查项可适当放宽样本量要求，D7 关注方法严谨性而非创新性。`,
    );
  }

  if (withIF.length >= 3) {
    adjustments.push(
      `该方向已有 ${withIF.length} 篇 IF 已知的论文，可用于 D5 论文候选的目标期刊基准。`,
    );
  }

  if (journals.length > 0) {
    const uniqueJournals = [...new Set(journals)];
    adjustments.push(
      `该方向论文发表于 ${uniqueJournals.slice(0, 5).join("、")}${uniqueJournals.length > 5 ? " 等" : ""}，D5 建议优先推荐这些期刊。`,
    );
  }

  // 从知识库 metrics 获取该方向文献质量概览
  try {
    const kbStyles = await prisma.knowledgeFile.findMany({
      where: { metrics: { not: "" } },
      select: { metrics: true },
      take: 50,
    });

    let highImpactCount = 0;
    for (const k of kbStyles) {
      try {
        const m = JSON.parse(k.metrics || "{}") as Record<string, unknown>;
        if ((m.impactFactor as number || 0) > 8) highImpactCount++;
      } catch { /* skip */ }
    }
    if (highImpactCount > 0) {
      adjustments.push(
        `文献库中包含 ${highImpactCount} 篇高 IF（>8）文献，说明该方向有高影响力研究潜力。`,
      );
    }
  } catch { /* calibration is advisory only */ }

  return {
    publishedCount: papers.length,
    avgIF,
    maxIF,
    journals: [...new Set(journals)],
    rubricAdjustments: adjustments,
    summary: papers.length > 0
      ? `该方向已发表 ${papers.length} 篇论文${avgIF ? `，平均 IF=${avgIF}` : ""}。${adjustments.slice(0, 2).join(" ")}`
      : "该方向暂无已发表论文记录，将使用通用 SCI 质量标准。",
  };
}
