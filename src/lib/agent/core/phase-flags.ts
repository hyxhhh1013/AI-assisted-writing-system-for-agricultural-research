/**
 * 阶段制开关。只读后台 SystemSetting，不读环境变量。
 * 未设置或非法值一律关闭。影子模式只记轨迹，不拦工具。
 */

import type { AgentPhaseId } from "@/contracts/agent-phase";
import { toolsForPhase } from "@/contracts/agent-phase";
import { resolveAgentPhase } from "@/lib/agent/core/agent-phase";
import { isAgentWritePublicEnabled } from "@/lib/agent/core/safety";
import type { AgentContext } from "@/lib/agent/types";

export const AGENT_PHASE_MODE_KEY = "AGENT_PHASE_MODE";
export const AGENT_PHASE_ENFORCE_KEY = "AGENT_PHASE_ENFORCE";
export const AGENT_PHASE_CARD_KEY = "AGENT_PHASE_CARD";
export const AGENT_PHASE_DONE_KEY = "AGENT_PHASE_DONE";

export type AgentPhaseMode = "off" | "shadow" | "enforce";
export type AgentPhaseDoneMode = "off" | "shadow" | "on";

export function parsePhaseMode(raw: string | null | undefined): AgentPhaseMode {
  const v = raw?.trim().toLowerCase();
  if (v === "shadow" || v === "enforce") return v;
  return "off";
}

export function parseEnforcedPhases(raw: string | null | undefined): Set<AgentPhaseId> {
  const allowed = new Set<AgentPhaseId>([
    "config",
    "literature",
    "outline",
    "draft",
    "citation",
    "abstract",
    "review",
    "diagnose",
  ]);
  const out = new Set<AgentPhaseId>();
  for (const part of (raw ?? "").split(",")) {
    const id = part.trim().toLowerCase();
    if (allowed.has(id as AgentPhaseId)) out.add(id as AgentPhaseId);
  }
  return out;
}

export function parsePhaseCardEnabled(raw: string | null | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function parsePhaseDoneMode(raw: string | null | undefined): AgentPhaseDoneMode {
  const v = raw?.trim().toLowerCase();
  if (v === "shadow" || v === "on") return v;
  return "off";
}

async function readSetting(key: string): Promise<string | null> {
  try {
    const { getSetting } = await import("@/lib/settings");
    return await getSetting(key);
  } catch {
    return null;
  }
}

export async function readPhaseMode(): Promise<AgentPhaseMode> {
  return parsePhaseMode(await readSetting(AGENT_PHASE_MODE_KEY));
}

export async function readEnforcedPhases(): Promise<Set<AgentPhaseId>> {
  return parseEnforcedPhases(await readSetting(AGENT_PHASE_ENFORCE_KEY));
}

export async function readPhaseCardEnabled(): Promise<boolean> {
  return parsePhaseCardEnabled(await readSetting(AGENT_PHASE_CARD_KEY));
}

export async function readPhaseDoneMode(): Promise<AgentPhaseDoneMode> {
  return parsePhaseDoneMode(await readSetting(AGENT_PHASE_DONE_KEY));
}

/** 用当前快照重算阶段。不读库。 */
export function rememberAgentPhase(ctx: AgentContext): void {
  ctx.phaseState = resolveAgentPhase({
    snapshot: ctx.projectSnapshot ?? null,
    intentKind: ctx.intentKind ?? null,
    writeEnabled: isAgentWritePublicEnabled(),
  });
}

/** 每轮开始读一次后台开关，并记下阶段。之后本轮不再读库。 */
export async function loadAgentPhaseMode(ctx: AgentContext): Promise<void> {
  ctx.phaseMode = await readPhaseMode();
  rememberAgentPhase(ctx);
}

/**
 * 影子模式：这个工具不在当前阶段集合里时，返回轨迹原因。
 * 原因格式给 harvest 聚合「阶段 × 工具」。返回 null 表示不记。
 */
export function phaseShadowReason(
  toolName: string,
  ctx: Pick<AgentContext, "phaseMode" | "phaseState" | "projectSnapshot">,
): string | null {
  if (ctx.phaseMode !== "shadow" || !ctx.phaseState) return null;
  const allowed = new Set(toolsForPhase(ctx.phaseState.phase, ctx.projectSnapshot?.mode));
  if (allowed.has(toolName)) return null;
  return `phase=${ctx.phaseState.phase} 不含 ${toolName}`;
}
