/**
 * 合成阶段后处理 — 将 synthesis 调整写回维度与候选
 */

import type {
  AnalysisDimension,
  PaperCandidate,
  SynthesisResult,
} from "@/contracts/direction";

export function applySynthesisAdjustments(
  dimensions: AnalysisDimension[],
  candidates: PaperCandidate[],
  synthesis?: SynthesisResult | null,
): { dimensions: AnalysisDimension[]; candidates: PaperCandidate[] } {
  if (!synthesis?.contradictions?.length) {
    return { dimensions, candidates };
  }

  const dimMap = new Map(dimensions.map((d) => [d.id, { ...d }]));
  let adjustedCandidates = candidates.map((c) => ({ ...c }));

  for (const contradiction of synthesis.contradictions) {
    for (const [dimId, score] of Object.entries(contradiction.adjustedScores || {})) {
      const dim = dimMap.get(dimId);
      if (dim && typeof score === "number") {
        dim.score = Math.min(10, Math.max(1, Math.round(score)));
        dim.summary += `\n\n[合成修正 ${contradiction.pair.join("↔")}] ${contradiction.resolution}`;
      }
    }

    const pair = contradiction.pair;
    const isD4D5 =
      pair.includes("D4") &&
      pair.includes("D5") &&
      contradiction.severity === "high";

    if (isD4D5) {
      adjustedCandidates = adjustedCandidates.map((c) =>
        c.tier === "ready" ? { ...c, tier: "needs_experiment" as const } : c,
      );
    }
  }

  const order = ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8"];
  const orderedDimensions = order
    .map((id) => dimMap.get(id))
    .filter(Boolean) as AnalysisDimension[];

  return {
    dimensions: orderedDimensions.length > 0 ? orderedDimensions : dimensions,
    candidates: adjustedCandidates,
  };
}
