/**
 * 分析快照指纹 — 资产 ID + 评价标准变更时标记过期
 */

import type { DirectionAsset, DirectionAnalysis } from "@/contracts/direction";

export function computeAnalysisFingerprint(
  assets: DirectionAsset[],
  evaluationContract: unknown,
): number {
  const assetIds = assets.map((a) => a.id).sort().join(",");
  const contractStr = evaluationContract ? JSON.stringify(evaluationContract) : "";
  const str = `${assetIds}|${contractStr}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

export function isAnalysisFingerprintStale(
  assets: DirectionAsset[],
  analysis?: DirectionAnalysis | null,
): boolean {
  if (!analysis?.analysisFingerprint) return false;
  const contract = analysis.evaluationContract ?? null;
  return analysis.analysisFingerprint !== computeAnalysisFingerprint(assets, contract);
}
