import {
  getPhaseTaskPack,
  type PhaseTaskPack,
} from "@/contracts/phase-task-pack";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import {
  formatAgentProjectBriefing,
  suggestNextAgentActions,
} from "@/lib/agent/project-briefing";
import {
  evaluateDraftCoverage,
  sectionCharsFromFills,
} from "@/lib/draft-coverage";

export interface ResolvedPhaseTaskPack {
  pack: PhaseTaskPack;
  /** 可直接作为 Agent goal */
  goal: string;
  briefingExtra: string;
}

/** 结合项目快照解析「当前该干什么」 */
export function resolvePhaseTaskPack(
  snapshot: AgentProjectSnapshot | null | undefined,
  phaseOverride?: number | null,
): ResolvedPhaseTaskPack {
  const phase =
    phaseOverride != null
      ? phaseOverride
      : snapshot?.currentPhase != null
        ? snapshot.currentPhase
        : 1;
  const pack = getPhaseTaskPack(phase);

  const empty = snapshot
    ? snapshot.sectionFills
      .filter((s) => s.chars === 0 && s.key !== "abstract")
      .map((s) => s.key)
    : [];
  const coverage = snapshot
    ? evaluateDraftCoverage({
      mode: snapshot.mode,
      language: snapshot.language,
      sectionChars: sectionCharsFromFills(snapshot.sectionFills),
    })
    : null;
  const nextTips = suggestNextAgentActions({
    currentPhase: pack.phase,
    writeEnabled: true,
    hasOutline: Boolean(snapshot?.outline?.trim() && snapshot.outline.trim().length >= 20),
    hasWritingBlueprint: Boolean(snapshot?.hasWritingBlueprint),
    emptySections: empty,
    nextSectionKey: coverage?.nextSectionKey,
    thinOrGapSections: coverage
      ? [...coverage.requiredGaps, ...coverage.thinKeys]
      : undefined,
  });
  const goal = nextTips[0] ?? pack.goal;

  const briefingExtra = [
    `【阶段任务包】Phase ${pack.phase} ${pack.title}`,
    `目标：${goal}`,
    `推荐工具：${pack.preferredTools.join(", ") || "（人控）"}`,
    `约束：${pack.constraints.join("；")}`,
    `人控兜底：${pack.humanFallback}`,
  ].join("\n");

  return { pack, goal, briefingExtra };
}

export function appendPhasePackToBriefing(
  baseBriefing: string,
  snapshot: AgentProjectSnapshot | null | undefined,
): string {
  const resolved = resolvePhaseTaskPack(snapshot);
  const base = baseBriefing.trim() || formatAgentProjectBriefing(snapshot);
  return `${base}\n\n${resolved.briefingExtra}`;
}
