/**
 * WRITE-QA-005：写节回修环。
 * persist 由 011 看 block + 事实类 repair（错引/未绑硬挂/overclaim）。
 */

import type { EvidenceClaim } from "@/contracts/data-source";
import type { SectionSpecV1 } from "@/contracts/section-spec";
import type { WritingQaFinding, WritingQaReport } from "@/contracts/writing-qa";
import { evaluateSectionWritingQa } from "@/lib/agent/writing-qa-run";
import {
  applyWritingPatches,
  formatWritingRefineFeedback,
  hasWritingRefineCandidate,
  type WritingPatch,
} from "@/lib/agent/writing-patches";
import { runAgentRefineContent } from "@/lib/agent/writing-runner";

const REFINE_CONTEXT =
  "定向修补：只改 feedback 列出的句子。禁止整节重写、禁止删引用、禁止另起炉灶。";

export interface RepairSectionDraftInput {
  draft: string;
  sectionKey: string;
  extraFindings?: WritingQaFinding[];
  /** 按当前草稿重算 extra（unbound 是否硬挂 [n]） */
  extraFindingsFor?: (draft: string) => WritingQaFinding[] | undefined;
  allowedCiteNs?: readonly number[];
  maxRefIndex: number;
  userId: string;
  signal: AbortSignal;
  projectMode?: "review" | "research";
  /** 默认 true；false 只做确定性补丁 */
  allowRefine?: boolean;
  dataClaims?: EvidenceClaim[];
  spec?: SectionSpecV1 | null;
  subsectionTitle?: string;
  softRefs?: ReadonlyArray<{ n: number; abstract: string }>;
}

export interface RepairSectionDraftResult {
  draft: string;
  qaReport: WritingQaReport;
  patches: WritingPatch[];
  refined: boolean;
}

function runQa(
  text: string,
  sectionKey: string,
  extraFindings: WritingQaFinding[] | undefined,
  maxRefIndex: number,
  dataClaims?: EvidenceClaim[],
  spec?: SectionSpecV1 | null,
  subsectionTitle?: string,
  softRefs?: ReadonlyArray<{ n: number; abstract: string }>,
): WritingQaReport {
  return evaluateSectionWritingQa({
    text,
    sectionKey,
    extraFindings,
    maxRefIndex,
    dataClaims,
    spec,
    subsectionTitle,
    softRefs,
  });
}

export async function repairSectionDraft(
  input: RepairSectionDraftInput,
): Promise<RepairSectionDraftResult> {
  const extrasFor = (text: string) =>
    input.extraFindingsFor?.(text) ?? input.extraFindings;
  const maxRefIndex = input.maxRefIndex;
  const claims = input.dataClaims;
  const spec = input.spec;
  const sub = input.subsectionTitle;
  const softRefs = input.softRefs;
  const first = runQa(
    input.draft,
    input.sectionKey,
    extrasFor(input.draft),
    maxRefIndex,
    claims,
    spec,
    sub,
    softRefs,
  );
  const applied = applyWritingPatches(input.draft, first.findings, {
    maxRefIndex,
    sectionKey: input.sectionKey,
    allowedCiteNs: input.allowedCiteNs,
  });
  let draft = applied.draft;
  let qaReport = draft === input.draft
    ? first
    : runQa(draft, input.sectionKey, extrasFor(draft), maxRefIndex, claims, spec, sub, softRefs);

  let refined = false;
  if (input.allowRefine !== false && hasWritingRefineCandidate(qaReport.findings)) {
    try {
      const out = await runAgentRefineContent({
        draft,
        feedback: formatWritingRefineFeedback(qaReport.findings),
        contextText: REFINE_CONTEXT,
        maxRefIndex,
        projectMode: input.projectMode,
        userId: input.userId,
        signal: input.signal,
      });
      if (out.draft.trim().length >= 10) {
        draft = out.draft;
        qaReport = runQa(
          draft,
          input.sectionKey,
          extrasFor(draft),
          maxRefIndex,
          claims,
          spec,
          sub,
          softRefs,
        );
        refined = true;
      }
    } catch {
      // 确定性结果保留；不因 refine 失败阻断写回
    }
  }

  return { draft, qaReport, patches: applied.patches, refined };
}

export function appendPatchNoteToSummary(
  summary: string,
  repair: Pick<RepairSectionDraftResult, "patches" | "refined">,
): string {
  const bits: string[] = [];
  if (repair.patches.length > 0) bits.push(`已确定性修补 ${repair.patches.length} 项`);
  if (repair.refined) bits.push("定向 refine 1 次");
  if (bits.length === 0) return summary;
  return `${summary} · ${bits.join("，")}`;
}
