/**
 * 路线图论文 ↔ D5 候选匹配
 *
 * AI 生成路线图时常用 candidate-1 等占位 ID，与 D5 实际 id 不一致。
 */

import type { PaperCandidate } from "@/contracts/direction";

export function resolveCandidateForRoadmapPaper(
  candidateId: string,
  candidates: PaperCandidate[],
  priority?: number,
): PaperCandidate | undefined {
  if (!candidates.length) return undefined;

  const byId = candidates.find((c) => c.id === candidateId);
  if (byId) return byId;

  const indexMatch = candidateId.match(/(?:candidate|paper|c)[-_]?(\d+)$/i);
  if (indexMatch) {
    const idx = parseInt(indexMatch[1], 10) - 1;
    if (idx >= 0 && idx < candidates.length) return candidates[idx];
  }

  if (priority != null && priority >= 1 && priority <= candidates.length) {
    const byPriority = [...candidates].sort((a, b) => b.overallScore - a.overallScore);
    return byPriority[priority - 1];
  }

  const normalized = candidateId.toLowerCase().replace(/\s+/g, " ");
  return candidates.find(
    (c) => c.title.toLowerCase().replace(/\s+/g, " ").includes(normalized) ||
      normalized.includes(c.title.toLowerCase().slice(0, 20)),
  );
}

/** 是否允许启动写作（规划中且未关联项目） */
export function canStartWritingFromRoadmap(
  paper: { status: string; linkedProjectId?: string },
): boolean {
  return paper.status === "planned" && !paper.linkedProjectId;
}

export function writingActionLabel(tier: PaperCandidate["tier"]): string {
  if (tier === "needs_experiment") return "带缺口写作";
  if (tier === "long_term") return "规划启动写作";
  return "开始写作";
}
