import type { PaperPassport, PaperPhase, PhaseStatus } from "@/contracts/paper-passport";

export interface PassportProgressSignals {
  referenceCount: number;
  hasBlueprint: boolean;
  outlineChars: number;
  filledCoreSections: number;
  totalCoreSections: number;
  expandedOutlineCount: number;
  abstractChars: number;
  reviewDoneCount: number;
  /** Phase 3：论证蓝图已确认 */
  hasConfirmedArgument: boolean;
  /** Phase 7：至少导出过一种格式 */
  hasExported: boolean;
}

function phaseKey(n: number): `${PaperPhase}` {
  return String(n) as `${PaperPhase}`;
}

export function resolveCurrentPhase(
  phaseStatus: Record<`${PaperPhase}`, PhaseStatus>,
): PaperPhase {
  for (let i = 0; i <= 7; i++) {
    if (phaseStatus[phaseKey(i)] !== "done") return i as PaperPhase;
  }
  return 7;
}

function unlockFollowingPhases(
  phaseStatus: Record<`${PaperPhase}`, PhaseStatus>,
): void {
  for (let i = 0; i < 7; i++) {
    const current = phaseStatus[phaseKey(i)];
    const next = phaseStatus[phaseKey(i + 1)];
    if (current === "done" && next === "locked") {
      phaseStatus[phaseKey(i + 1)] = "ready";
    }
  }
}

/** 根据项目快照信号重算各阶段状态（纯函数，供单测与 sync 复用） */
export function recomputePassportProgress(
  passport: PaperPassport,
  signals: PassportProgressSignals,
): PaperPassport {
  const phaseStatus = { ...passport.phaseStatus };

  if (passport.config) {
    phaseStatus["0"] = "done";
  }

  if (signals.referenceCount >= 1) {
    phaseStatus["1"] = "done";
  } else if (phaseStatus["0"] === "done" && phaseStatus["1"] === "locked") {
    phaseStatus["1"] = "ready";
  }

  const hasArchitecture = signals.outlineChars >= 80 && signals.hasBlueprint;
  if (hasArchitecture) {
    phaseStatus["2"] = "done";
  } else if (phaseStatus["1"] === "done") {
    if (signals.outlineChars > 0 || signals.hasBlueprint) {
      phaseStatus["2"] = "in_progress";
    } else if (phaseStatus["2"] === "locked") {
      phaseStatus["2"] = "ready";
    }
  }

  // Phase 3：论证蓝图已确认（不再用 expandedOutlineCount 冒充）
  if (signals.hasConfirmedArgument) {
    phaseStatus["3"] = "done";
  } else if (phaseStatus["2"] === "done") {
    phaseStatus["3"] = phaseStatus["3"] === "locked" ? "ready" : "in_progress";
  }

  const fillRatio = signals.totalCoreSections > 0
    ? signals.filledCoreSections / signals.totalCoreSections
    : 0;
  // Phase 4：须 Phase 3 论证蓝图确认后才能解锁/推进（禁止正文填满冒充）
  if (phaseStatus["3"] === "done") {
    if (fillRatio >= 1) {
      phaseStatus["4"] = "done";
    } else if (fillRatio >= 0.2) {
      phaseStatus["4"] = "in_progress";
    } else if (phaseStatus["4"] === "locked") {
      phaseStatus["4"] = "ready";
    }
  } else {
    phaseStatus["4"] = "locked";
  }

  // Phase 5：引用 + 摘要门禁（skill 5a/5b 合并为顺序过关）
  const citationsOk = signals.referenceCount >= 3 && fillRatio >= 0.5;
  const abstractOk = signals.abstractChars >= 80;
  if (citationsOk && abstractOk) {
    phaseStatus["5"] = "done";
  } else if (phaseStatus["4"] === "done") {
    if (citationsOk || abstractOk || signals.abstractChars > 0) {
      phaseStatus["5"] = "in_progress";
    } else if (phaseStatus["5"] === "locked") {
      phaseStatus["5"] = "ready";
    }
  }

  // Phase 6：审查（最多 2 轮 done）
  if (signals.reviewDoneCount >= 1) {
    phaseStatus["6"] = signals.reviewDoneCount >= 2 ? "done" : "in_progress";
  } else if (phaseStatus["5"] === "done" && phaseStatus["6"] === "locked") {
    phaseStatus["6"] = "ready";
  }

  // Phase 7：导出
  if (signals.hasExported) {
    phaseStatus["7"] = "done";
  } else if (phaseStatus["6"] === "done" && phaseStatus["7"] === "locked") {
    phaseStatus["7"] = "ready";
  } else if (phaseStatus["6"] === "in_progress" && phaseStatus["7"] === "locked") {
    // 至少跑过一轮审查即可准备导出（Critical 由 export-gate 硬拦截）
    phaseStatus["7"] = "ready";
  }

  unlockFollowingPhases(phaseStatus);

  return {
    ...passport,
    phaseStatus,
    currentPhase: resolveCurrentPhase(phaseStatus),
    updatedAt: Date.now(),
  };
}

export function getNextPhaseHint(passport: PaperPassport): string | null {
  const phase = passport.currentPhase;
  const status = passport.phaseStatus[phaseKey(phase)];
  if (status === "done") return null;
  const hints: Record<PaperPhase, string> = {
    0: "完善论文配置",
    1: "导入或检索参考文献",
    2: "生成大纲与写作蓝图",
    3: "确认论证蓝图（claim–evidence）",
    4: "协作扩写各章节",
    5: "核对引用并撰写摘要",
    6: "运行论文审查（最多 2 轮）",
    7: "导出 DOCX / PDF / Markdown",
  };
  return hints[phase] ?? null;
}
