/**
 * W3-E2E-EVAL — 产品门禁固定样例（无 LLM，可进 CI）
 */

import { getPhaseTaskPack, PHASE_TASK_PACKS } from "@/contracts/phase-task-pack";
import { evaluateCitationGate } from "@/lib/citation-gate";
import { checkAgentToolPhaseGate } from "@/lib/agent/core/phase-gates";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import { REVIEW_MAX_ROUNDS, buildReviewRoundHint } from "@/contracts/review-rounds";
import {
  createInitialPaperPassport,
} from "@/contracts/paper-passport";
import { recomputePassportProgress } from "@/lib/paper-passport-progress";
import { assessExportReadiness } from "@/lib/export-readiness";
import type { ProjectData } from "@/contracts/project";

export interface ProductGateCaseResult {
  id: string;
  ok: boolean;
  detail: string;
}

function snap(partial: Partial<AgentProjectSnapshot> = {}): AgentProjectSnapshot {
  return {
    title: "评测项目",
    mode: "research",
    language: "zh",
    template: "sci",
    citationStyle: "gbt7714",
    researchDirection: "x",
    outline: "x".repeat(80),
    references: ["r1", "r2", "r3", "r4", "r5"],
    dataClaims: [],
    currentPhase: 4,
    hasWritingBlueprint: true,
    hasArgumentBlueprint: true,
    sectionFills: [
      { key: "introduction", chars: 200 },
      { key: "methods", chars: 0 },
    ],
    ...partial,
  };
}

/** 返回失败用例列表；空数组 = 全绿 */
export function runProductGateCases(): ProductGateCaseResult[] {
  const results: ProductGateCaseResult[] = [];

  const push = (id: string, ok: boolean, detail: string) => {
    results.push({ id, ok, detail });
  };

  // 1) 阶段任务包覆盖 0–7，且 Phase 5/7 工具对齐产品决策
  for (let p = 0; p <= 7; p++) {
    const pack = getPhaseTaskPack(p);
    push(
      `phase-pack-${p}`,
      pack.phase === p && Boolean(PHASE_TASK_PACKS[p]),
      `phase=${pack.phase} tools=${pack.preferredTools.join(",")}`,
    );
  }
  push(
    "phase-5-validate-citations",
    getPhaseTaskPack(5).preferredTools.includes("validate_citations"),
    "Phase 5 必须推荐 validate_citations",
  );
  push(
    "phase-7-run-review-rounds",
    getPhaseTaskPack(7).preferredTools.includes("run_review_rounds"),
    "Phase 7 必须推荐 run_review_rounds",
  );

  // 2) 引用硬检：越界不可过稿
  const blocked = evaluateCitationGate({
    texts: ["结论表明产量提升[1][99]。"],
    refCount: 3,
  });
  push(
    "cite-gate-oob-blocks",
    !blocked.exportReady && blocked.outOfBounds.includes(99),
    blocked.hint,
  );
  const okGate = evaluateCitationGate({
    texts: ["研究背景见文献[1][2]。"],
    refCount: 4,
  });
  push("cite-gate-pass", okGate.exportReady, okGate.hint);

  // 3) 阶段门禁：无大纲不可写
  const noOutline = checkAgentToolPhaseGate(
    "write_section",
    { section: "introduction" },
    snap({ outline: "短", currentPhase: 4 }),
  );
  push(
    "gate-no-outline",
    !noOutline.ok,
    noOutline.ok ? "unexpected ok" : noOutline.error,
  );

  const withOutline = checkAgentToolPhaseGate(
    "write_section",
    { section: "introduction" },
    snap({ currentPhase: 4 }),
  );
  push(
    "gate-write-ok",
    withOutline.ok,
    withOutline.ok ? "ok" : withOutline.error,
  );

  // 4) Passport：cite gate 控制 Phase 5
  const config = {
    paperTitle: "E",
    paperType: "research" as const,
    targetJournal: "",
    wordCount: "",
    language: "zh" as const,
    citationStyle: "gbt7714" as const,
  };
  const base = createInitialPaperPassport(config);
  const p5fail = recomputePassportProgress(base, {
    referenceCount: 5,
    hasBlueprint: true,
    hasArgumentBlueprint: true,
    outlineChars: 120,
    filledCoreSections: 4,
    totalCoreSections: 4,
    expandedOutlineCount: 0,
    abstractChars: 0,
    reviewDoneCount: 0,
    citationGatePassed: false,
    citationOutOfBounds: [9],
    citationCount: 2,
  });
  push("passport-p5-blocked", p5fail.phaseStatus["5"] !== "done", `p5=${p5fail.phaseStatus["5"]}`);

  const p5ok = recomputePassportProgress(base, {
    referenceCount: 5,
    hasBlueprint: true,
    hasArgumentBlueprint: true,
    outlineChars: 120,
    filledCoreSections: 4,
    totalCoreSections: 4,
    expandedOutlineCount: 0,
    abstractChars: 100,
    reviewDoneCount: 2,
    citationGatePassed: true,
    citationOutOfBounds: [],
    citationCount: 4,
  });
  push(
    "passport-p5-done",
    p5ok.phaseStatus["5"] === "done" && p5ok.phaseStatus["7"] === "done",
    `p5=${p5ok.phaseStatus["5"]} p7=${p5ok.phaseStatus["7"]}`,
  );

  // 5) 审查轮次上限
  push("review-max-2", REVIEW_MAX_ROUNDS === 2, `max=${REVIEW_MAX_ROUNDS}`);
  const hint = buildReviewRoundHint(
    {
      projectId: "e",
      doneCount: 2,
      maxRounds: 2,
      remaining: 0,
      complete: true,
      lastCheckId: null,
      lastScore: 80,
      lastGrade: "B",
    },
    0,
  );
  push("review-hint-complete", hint.includes("2 轮"), hint);

  // 6) 导出就绪：越界不可过稿（W4-EXPORT）
  const blockedExport = assessExportReadiness({
    id: "e",
    title: "T",
    authors: "",
    affiliations: "",
    abstract: "",
    keywords: "",
    classification: "",
    researchDirection: "",
    outline: "",
    template: "sci",
    lastUpdated: 1,
    sections: { introduction: "越界[42]" },
    references: ["a", "b"],
    analysisResults: [],
  } as ProjectData);
  push(
    "export-cite-gate",
    !blockedExport.ok && blockedExport.gate.outOfBounds.includes(42),
    blockedExport.gate.hint,
  );

  return results;
}

export function summarizeProductGateResults(
  results: ProductGateCaseResult[],
): { passed: number; failed: number; failures: ProductGateCaseResult[] } {
  const failures = results.filter((r) => !r.ok);
  return {
    passed: results.length - failures.length,
    failed: failures.length,
    failures,
  };
}
