import type { EvidenceClaim } from "@/contracts/data-source";
import {
  compactCitationsToUsedReferences,
  resolveAllowedCitationIndices,
  stripDisallowedCitations,
} from "@/lib/reference-reorder";
import { normalizeAllCitationFormats, validateCitations, validateDataClaims } from "@/lib/citation";
import type { PreparedWritingContext, WritingPipelineEmit } from "../types";

/** 快速/逐条路径：归一化 + 仅保留有 RAG 全文的编号 */
export function sanitizeDraftCitations(
  draft: string,
  prepared: PreparedWritingContext,
): string {
  const allowed = resolveAllowedCitationIndices(
    prepared.referencesByIndex.length,
    prepared.groundedRefIndices,
  );
  return stripDisallowedCitations(normalizeAllCitationFormats(draft), allowed);
}

export interface FinalizeCitationsResult {
  text: string;
  references: string[];
  usedNewSources: string[];
  /** 是否相对输入草稿改写了正文（含 sanitize / 紧凑重排） */
  textChanged: boolean;
}

/**
 * 定稿引用：sanitize → 按首次出现紧凑重排 [n] 与参考文献表 → 发 SSE。
 * 保证正文编号与 references 列表 1..K 对齐。
 */
export function finalizeAndEmitCitations(
  draft: string,
  prepared: PreparedWritingContext,
  emit: WritingPipelineEmit,
): FinalizeCitationsResult {
  const sanitized = sanitizeDraftCitations(draft, prepared);
  const compacted = compactCitationsToUsedReferences(sanitized, prepared.referencesByIndex);

  let text = sanitized;
  let references: string[] = [];
  let refMapping = prepared.refMapping;

  if (compacted && compacted.references.length > 0) {
    text = compacted.text;
    references = compacted.references;
    refMapping = {};
    compacted.references.forEach((src, i) => {
      refMapping[src] = i + 1;
    });
  }

  if (text !== draft) {
    emit({ type: "corrected_text", text });
  }

  const usedNewSources = references.filter((ref) => prepared.newSources.includes(ref));

  if (references.length > 0) {
    emit({ type: "references", references, refMapping });
  } else if (Object.keys(prepared.refMapping).length > 0) {
    emit({ type: "info", info: "", refMapping: prepared.refMapping });
  }

  return {
    text,
    references,
    usedNewSources,
    textChanged: text !== draft,
  };
}

/** @deprecated 使用 finalizeAndEmitCitations；保留供旧调用兼容 */
export function emitDraftReferences(
  draft: string,
  prepared: PreparedWritingContext,
  emit: WritingPipelineEmit,
): string[] {
  return finalizeAndEmitCitations(draft, prepared, emit).usedNewSources;
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
  const finalized = finalizeAndEmitCitations(checkTarget, prepared, emit);

  const citationChecks = validateCitations(finalized.text, contextText);
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
    const dataChecks = validateDataClaims(finalized.text, dataClaims);
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
  const newRefCount = finalized.usedNewSources.length;
  emit({
    type: "pipeline_step",
    step: "checking_citations",
    status: "done",
    detail: `${citFailedCount > 0 ? `发现 ${citFailedCount} 条引用风险` : "引用校验通过"}${newRefCount > 0 ? `，已追加 ${newRefCount} 条参考文献` : ""}`,
  });

  emit({ type: "status", status: "completed" });
}
