/**
 * 【已冻结 — W3-AP-ARCH-03】
 * 协作扩写管道编排（Writer → Verifier → Refiner）。专家工具遗留，产品写作入口为 Agent。
 * 禁止新增写作规则/引用规则/质检分支；仅 bug 修复与安全加固。规则变更只改 Agent 侧。
 */
import type { EvidenceClaim } from "@/contracts/data-source";
import type { WritingInput } from "@/lib/validations";
import { prepareWritingContext } from "./prepare-context";
import { runAuditOnlyMode, runFixOnlyMode } from "./pipeline/modes";
import { runWriterPhase, runExpandBulletPhase } from "./pipeline/writer";
import { runVerifierPhase } from "./pipeline/verifier";
import { runRefinerPhase } from "./pipeline/refiner";
import { runFinalizePhase, finalizeAndEmitCitations } from "./pipeline/finalize";
import type { WritingGlobalContext, WritingPipelineEmit } from "./types";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runWritingPipeline(params: {
  req: Request;
  data: WritingInput;
  context: string;
  dataClaims: EvidenceClaim[];
  globalContext: WritingGlobalContext | undefined;
  userId?: string;
  emit: WritingPipelineEmit;
  finishStream: () => void;
}): Promise<void> {
  const { req, data, context, dataClaims, globalContext, userId, emit, finishStream } = params;
  const { mode, verificationFeedback: manualFeedback } = data;
  const signal = req.signal;

  const prepared = await prepareWritingContext(data, context, dataClaims, globalContext, emit);

  if (mode === "audit_only") {
    await runAuditOnlyMode(
      { req, data, context, dataClaims, globalContext, userId, emit, signal, finishStream },
      prepared,
    );
    return;
  }

  if (mode === "fix_only" && manualFeedback) {
    await runFixOnlyMode(
      { req, data, context, dataClaims, globalContext, userId, emit, signal, finishStream },
      prepared,
    );
    return;
  }

  if (mode === "expand_bullet") {
    await runExpandBulletPhase(data, prepared, emit, signal);
    finishStream();
    return;
  }

  const { initialDraft, finalDraft } = await runWriterPhase(data, prepared, emit, signal);

  if (mode === "fast") {
    finalizeAndEmitCitations(finalDraft, prepared, emit);
    emit({ type: "status", status: "completed" });
    finishStream();
    return;
  }

  const { verificationReport, failedVerificationIssues } = await runVerifierPhase(
    initialDraft,
    prepared,
    emit,
    userId,
    signal,
    data.projectMode,
  );
  await tick(40);

  const { refinedDraft, correctedDraft } = await runRefinerPhase(
    initialDraft,
    finalDraft,
    verificationReport,
    failedVerificationIssues,
    prepared,
    emit,
    userId,
    signal,
    data.projectMode,
  );

  await runFinalizePhase(refinedDraft, correctedDraft, prepared, dataClaims, emit);
  finishStream();
}
