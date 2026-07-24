/**
 * 检查点与铁律 — 对齐 academic-paper/SKILL.md Checkpoint Rules
 */

import type { CheckpointState, OperationalMode, StudioPhase, StudioSession } from "./types";
import { getMode } from "./modes";

export interface GateResult {
  ok: boolean;
  reason: string;
}

/** 铁律文案（对学生展示） */
export const IRON_RULES = [
  {
    id: "config-confirm",
    title: "配置必须确认",
    body: "「论文配置记录」确认之前，不能进入文献收集及之后阶段。",
  },
  {
    id: "outline-approve",
    title: "大纲必须批准",
    body: "结构大纲批准之前，不能进入论证构建阶段。",
  },
  {
    id: "revision-cap",
    title: "修订最多两轮",
    body: "模拟审稿后的大修/小修循环最多 2 轮；仍未解决的记入「已知局限」。",
  },
  {
    id: "critical-block",
    title: "严重问题拦住排版",
    body: "审稿中仍有未解决的严重问题（Critical）时，不能进入最终排版导出。",
  },
  {
    id: "no-fake-cite",
    title: "禁止编造文献",
    body: "每一条引用都必须真实可查；系统不会也不应虚构参考文献。",
  },
] as const;

export function canEnterPhase(session: StudioSession, target: StudioPhase): GateResult {
  const mode = session.mode;
  if (!mode) {
    return { ok: false, reason: "请先选择一种写作方式。" };
  }

  const allowed = getMode(mode).phases;
  if (!allowed.includes(target)) {
    return { ok: false, reason: "当前选择的写作方式不包含这一步。" };
  }

  const cp = session.checkpoints;

  if (target >= 1 && needsConfigConfirm(mode) && !cp.configConfirmed) {
    return { ok: false, reason: "请先确认「论文配置记录」（铁律）。" };
  }

  if (target === 1 && cp.skipLiterature) {
    return { ok: false, reason: "你已选择跳过文献阶段；可直接进入结构设计。" };
  }

  if (target >= 3 && allowed.includes(2) && !cp.outlineApproved && mode !== "revision" && mode !== "revision-coach") {
    return { ok: false, reason: "请先批准论文大纲（铁律）。" };
  }

  if (target === 7) {
    if (cp.criticalIssuesBlocking) {
      return { ok: false, reason: "仍有未解决的严重审稿问题，暂不能排版导出。" };
    }
    if (cp.revisionRound > 2) {
      return { ok: false, reason: "修订轮次已超过上限（最多 2 轮）。" };
    }
  }

  // 顺序：不可跳过中间未解锁阶段（除明确 skip literature）
  for (const p of allowed) {
    if (p >= target) break;
    if (p === 1 && cp.skipLiterature) continue;
    const status = session.phaseStatus[p];
    if (status !== "done" && status !== "skipped") {
      return { ok: false, reason: `请先完成「第 ${p} 步」再继续。` };
    }
  }

  return { ok: true, reason: "" };
}

function needsConfigConfirm(mode: OperationalMode): boolean {
  return mode !== "revision-coach" && mode !== "citation-check" && mode !== "format-convert" && mode !== "disclosure";
}

export function advanceAfterPhaseDone(
  session: StudioSession,
  donePhase: StudioPhase,
): Pick<StudioSession, "phaseStatus" | "currentPhase" | "checkpoints"> {
  const mode = session.mode!;
  const phases = getMode(mode).phases;
  const phaseStatus = { ...session.phaseStatus, [donePhase]: "done" as const };
  const checkpoints = { ...session.checkpoints };

  const idx = phases.indexOf(donePhase);
  const next = idx >= 0 && idx < phases.length - 1 ? phases[idx + 1] : donePhase;

  // 解锁下一阶段
  if (next !== donePhase && phaseStatus[next] === "locked") {
    phaseStatus[next] = "ready";
  }

  return { phaseStatus, currentPhase: next, checkpoints };
}

export function confirmConfig(checkpoints: CheckpointState): CheckpointState {
  return { ...checkpoints, configConfirmed: true };
}

export function approveOutline(checkpoints: CheckpointState): CheckpointState {
  return { ...checkpoints, outlineApproved: true };
}

export function skipLiterature(checkpoints: CheckpointState): CheckpointState {
  return { ...checkpoints, skipLiterature: true, sourcesReviewed: true };
}

export function recordReviewRound(
  checkpoints: CheckpointState,
  verdict: CheckpointState["reviewVerdict"],
  criticalBlocking: boolean,
): CheckpointState {
  const round = Math.min(2, checkpoints.revisionRound + 1);
  return {
    ...checkpoints,
    revisionRound: round,
    reviewVerdict: verdict,
    criticalIssuesBlocking: criticalBlocking,
  };
}
