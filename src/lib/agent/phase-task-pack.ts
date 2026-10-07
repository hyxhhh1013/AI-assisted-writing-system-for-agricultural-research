import {
  getPhaseTaskPack,
  type PhaseTaskPack,
} from "@/contracts/phase-task-pack";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import { resolveAgentPhase } from "@/lib/agent/core/agent-phase";
import { formatAgentProjectBriefing } from "@/lib/agent/project-briefing";

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

  const goal =
    resolveAgentPhase({
      snapshot,
      writeEnabled: true,
      phaseOverride: phase,
    }).nextAction ?? pack.goal;

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
