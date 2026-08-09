import type { PaperPassport, PaperPhase, PhaseStatus } from "@/contracts/paper-passport";

export interface PassportProgressSignals {
  referenceCount: number;
  hasBlueprint: boolean;
  hasArgumentBlueprint: boolean;
  outlineChars: number;
  filledCoreSections: number;
  totalCoreSections: number;
  expandedOutlineCount: number;
  abstractChars: number;
  reviewDoneCount: number;
  argumentChainCount?: number;
  argumentRebuttalCount?: number;
  /** W3-CITE-GATE：无越界引用且正文有 [n] → Phase 5 done */
  citationGatePassed?: boolean;
  /** 可导出：有文献且无越界（可不含文内引用） */
  citationExportReady?: boolean;
  citationOutOfBounds?: number[];
  citationCount?: number;
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

  // Phase 3：论证已并入写作蓝图；有写作蓝图即视为论证规划完成（兼容旧独立论证蓝图）
  if (signals.hasBlueprint || signals.hasArgumentBlueprint) {
    phaseStatus["3"] = "done";
  } else if (phaseStatus["2"] === "done" && phaseStatus["3"] === "locked") {
    phaseStatus["3"] = "ready";
  } else if (phaseStatus["2"] === "done") {
    phaseStatus["3"] = "ready";
  }

  const fillRatio = signals.totalCoreSections > 0
    ? signals.filledCoreSections / signals.totalCoreSections
    : 0;
  if (fillRatio >= 1) {
    phaseStatus["4"] = "done";
  } else if (fillRatio >= 0.2) {
    phaseStatus["4"] = "in_progress";
  } else if (
    (phaseStatus["3"] === "done" || phaseStatus["2"] === "done")
    && phaseStatus["4"] === "locked"
  ) {
    phaseStatus["4"] = "ready";
  }

  if (phaseStatus["4"] === "done" && phaseStatus["5"] === "locked") {
    phaseStatus["5"] = "ready";
  }
  // W3-CITE-GATE：仅当引用硬检通过才标 Phase 5 done（旧逻辑仅靠文献数会误过稿）
  if (signals.citationGatePassed) {
    phaseStatus["5"] = "done";
  } else if (
    signals.referenceCount >= 3
    && fillRatio >= 0.5
    && (signals.citationOutOfBounds?.length ?? 0) > 0
  ) {
    phaseStatus["5"] = "in_progress";
  } else if (
    signals.referenceCount >= 3
    && fillRatio >= 0.5
    && phaseStatus["4"] === "done"
  ) {
    phaseStatus["5"] = "in_progress";
  }

  if (signals.abstractChars >= 80) {
    phaseStatus["6"] = "done";
  } else if (phaseStatus["5"] === "done" && phaseStatus["6"] === "locked") {
    phaseStatus["6"] = "ready";
  }

  if (signals.reviewDoneCount >= 1) {
    phaseStatus["7"] = signals.reviewDoneCount >= 2 ? "done" : "in_progress";
  } else if (phaseStatus["6"] === "done" && phaseStatus["7"] === "locked") {
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
    3: "生成论证蓝图（主张—证据—推理）",
    4: "协作扩写各章节",
    5: "核对正文引用编号",
    6: "撰写摘要与关键词",
    7: "运行论文审查",
  };
  return hints[phase] ?? null;
}
