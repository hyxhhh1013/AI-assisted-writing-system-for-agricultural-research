/**
 * 方向论文反模式检测服务
 *
 * 用于审查板块（review）中对方向规划产出的论文进行质量审计。
 * 所有检测函数返回文本报告，可嵌入到现有审查报告中。
 */

import prisma from "@/lib/prisma";
import type { DirectionAsset, DirectionAnalysis, PaperCandidate } from "@/contracts/direction";
import { isAnalysisFingerprintStale } from "@/lib/direction-analysis-fingerprint";

export interface DirectionCheckResult {
  checkId: string;
  checkName: string;
  passed: boolean;
  severity: "high" | "medium" | "low";
  findings: string[];
  recommendation: string;
}

/**
 * 对一篇论文候选进行反模式检测
 * 检查项：数据充分性、与已发表重叠度、期刊匹配度、实验是否为空
 */
export async function checkCandidatePaper(
  candidate: PaperCandidate,
  directionSlug: string,
): Promise<DirectionCheckResult[]> {
  const results: DirectionCheckResult[] = [];

  const direction = await prisma.direction.findUnique({ where: { slug: directionSlug } });
  if (!direction) return results;

  const assets: DirectionAsset[] = Array.isArray(direction.assets)
    ? (direction.assets as unknown as DirectionAsset[])
    : [];
  const experiments = assets.filter((a) => a.kind === "experiment");

  // C1: 数据充分性检查
  const expCount = experiments.length;
  const hasDataBasis = candidate.tier === "ready" && expCount < 3;
  results.push({
    checkId: "C1",
    checkName: "数据充分性",
    passed: !hasDataBasis,
    severity: "high",
    findings: hasDataBasis
      ? [`标记为 ready 但方向仅有 ${expCount} 个实验资产记录`, "数据支撑可能不足"]
      : [],
    recommendation: hasDataBasis
      ? "建议降级为 needs_experiment，或补充实验数据"
      : "数据基础可支撑该论文",
  });

  // C2: 实验缺失检查
  const hasExperimentsMentioned = candidate.requiredExperiments && candidate.requiredExperiments.length > 0;
  results.push({
    checkId: "C2",
    checkName: "实验完整性",
    passed: !hasExperimentsMentioned,
    severity: "medium",
    findings: hasExperimentsMentioned
      ? [`论文需补 ${candidate.requiredExperiments.length} 项实验: ${candidate.requiredExperiments.join(", ")}`]
      : [],
    recommendation: hasExperimentsMentioned
      ? "建议在写作前完成缺失实验，或调整论文 Tier"
      : "数据基础可支撑该论文",
  });

  // C3: 期刊匹配检查
  const analysis = direction.analysis as DirectionAnalysis | null;
  const dims = analysis?.dimensions || [];
  const d7 = dims.find((d) => d.id === "D7");
  const hasJournalConflict = candidate.suggestedJournal && d7 && d7.score < 4;
  results.push({
    checkId: "C3",
    checkName: "期刊匹配度",
    passed: !hasJournalConflict,
    severity: "medium",
    findings: hasJournalConflict
      ? [
          `建议投稿 ${candidate.suggestedJournal}，但 D7（创新性）评分仅 ${d7.score}/10`,
          "该期刊要求可能超出当前数据能支撑的创新水平",
        ]
      : [],
    recommendation: hasJournalConflict
      ? "建议调整目标期刊为更低层级，或重新评估创新性"
      : "期刊与数据水平匹配",
  });

  return results;
}

/**
 * 对方向整体进行反模式审计
 * 检查项：资产数量、负结果记录、分析过期
 */
export function checkDirectionHealth(
  assets: DirectionAsset[],
  analysis: DirectionAnalysis | null,
): DirectionCheckResult[] {
  const results: DirectionCheckResult[] = [];

  // H1: 资产数量
  const assetCount = assets.length;
  results.push({
    checkId: "H1",
    checkName: "资产充分性",
    passed: assetCount >= 3,
    severity: "high",
    findings: assetCount < 3
      ? [`仅有 ${assetCount} 项资产，低于分析最低门槛（3 项）`]
      : [],
    recommendation: assetCount < 3 ? "请至少录入 3 项资产后再分析" : "OK",
  });

  // H2: 负结果记录
  const negCount = assets.filter((a) => a.kind === "experiment" && (a as { isNegativeResult?: boolean }).isNegativeResult).length;
  const totalExp = assets.filter((a) => a.kind === "experiment").length;
  results.push({
    checkId: "H2",
    checkName: "负结果记录",
    passed: negCount > 0 || totalExp === 0,
    severity: "low",
    findings: negCount === 0 && totalExp > 0
      ? [`${totalExp} 项实验中未记录任何负结果`, "可能遗漏了失败的实验路径"]
      : [],
    recommendation: "建议将失败或未达预期的实验标注 isNegativeResult=true，避免重复路径",
  });

  // H3: 分析新鲜度
  const isStale = analysis ? isAnalysisFingerprintStale(assets, analysis) : false;
  results.push({
    checkId: "H3",
    checkName: "分析时效",
    passed: !isStale,
    severity: "medium",
    findings: isStale ? ["资产已变更但分析未刷新", "当前分析结果可能基于过时数据"] : [],
    recommendation: isStale ? "建议重新运行 8 维度分析" : "OK",
  });

  return results;
}
