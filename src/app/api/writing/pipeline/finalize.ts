import type { EvidenceClaim } from "@/contracts/data-source";
import { collectCitationFirstAppearance } from "@/lib/reference-reorder";
import { validateCitations, validateDataClaims } from "@/lib/citation-validator";
import type { PreparedWritingContext, WritingPipelineEmit } from "../types";

/** 从草稿中提取引用编号并发送 references SSE 事件（快速模式共用） */
export function emitDraftReferences(
  draft: string,
  prepared: PreparedWritingContext,
  emit: WritingPipelineEmit,
): string[] {
  const { referencesByIndex, newSources, refMapping } = prepared;
  const maxRefIndex = referencesByIndex.length;

  const usedCitationIndexes = collectCitationFirstAppearance(draft, maxRefIndex);
  const citedReferences = usedCitationIndexes
    .map((idx) => referencesByIndex[idx - 1])
    .filter((ref): ref is string => Boolean(ref));
  const usedNewSources = citedReferences.filter((ref) => newSources.includes(ref));

  if (citedReferences.length > 0) {
    emit({ type: "references", references: citedReferences, refMapping });
  } else if (Object.keys(refMapping).length > 0) {
    emit({ type: "info", info: "", refMapping });
  }

  return usedNewSources;
}

export async function runFinalizePhase(
  refinedDraft: string,
  correctedDraft: string,
  prepared: PreparedWritingContext,
  dataClaims: EvidenceClaim[],
  emit: WritingPipelineEmit,
): Promise<void> {
  const { contextText } = prepared;

  emit({
    type: "pipeline_step",
    step: "checking_citations",
    status: "running",
    detail: "正在校验引用真实性...",
  });

  const checkTarget = refinedDraft || correctedDraft;
  const usedNewSources = emitDraftReferences(checkTarget, prepared, emit);

  const citationChecks = validateCitations(checkTarget, contextText);
  const failedChecks = citationChecks.filter((c) => !c.passed);
  if (failedChecks.length > 0) {
    emit({
      type: "citation_warnings",
      warnings: failedChecks.map((c) => ({
        num: c.number,
        overlap: Math.round(c.overlap * 100),
        context:
          c.citedSentence.length > 120 ? c.citedSentence.slice(0, 120) + "..." : c.citedSentence,
      })),
    });
  }

  if (dataClaims.length > 0) {
    const dataChecks = validateDataClaims(checkTarget, dataClaims);
    const failedDataChecks = dataChecks.filter((c) => !c.found || !c.citedCorrectly);
    if (failedDataChecks.length > 0) {
      emit({ type: "data_claim_warnings", warnings: failedDataChecks });
      emit({
        type: "pipeline_step",
        step: "checking_data",
        status: "done",
        detail: `${failedDataChecks.length} 条数据证据异常`,
      });
    } else {
      emit({
        type: "pipeline_step",
        step: "checking_data",
        status: "done",
        detail: "数据证据核查通过",
      });
    }
  }

  const citFailedCount = failedChecks.length;
  const newRefCount = usedNewSources.length;
  emit({
    type: "pipeline_step",
    step: "checking_citations",
    status: "done",
    detail: `${citFailedCount > 0 ? `发现 ${citFailedCount} 条引用风险` : "引用校验通过"}${newRefCount > 0 ? `，已追加 ${newRefCount} 条参考文献` : ""}`,
  });

  emit({ type: "status", status: "completed" });
}
