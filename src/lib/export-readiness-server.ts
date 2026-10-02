/**
 * 导出就绪检查（服务端）：解析 bib_only 后再跑硬检 + 软告警。
 * 禁止被 Client Component / hooks 直接 import（会拉进 rag → fs）。
 */

import type { ProjectData } from "@/contracts/project";
import {
  assessExportReadiness,
  type ExportReadiness,
} from "@/lib/export-readiness";
import { resolveBibOnlyIndexes } from "@/lib/reference-mode";
import { findReferenceRowsLite } from "@/lib/reference-rows";
import { refsFromLiteRows } from "@/lib/citation-grounding";
import { enrichCitedRefsWithPassages } from "@/lib/citation-passage-enrich";
import { evaluateCitationGate } from "@/lib/citation-gate";

/**
 * 服务端：解析项目 bib_only 编号后再做就绪检查，并用题录/摘要/PDF 段落做归属硬检。
 */
export async function assessExportReadinessAsync(
  project: ProjectData,
  opts?: { projectId?: string; userId?: string },
): Promise<ExportReadiness> {
  const projectId = opts?.projectId ?? project.id;
  let bibOnlyIndexes: Set<number> | undefined;
  if (projectId) {
    try {
      bibOnlyIndexes = await resolveBibOnlyIndexes(projectId, opts?.userId);
    } catch {
      bibOnlyIndexes = undefined;
    }
  }

  let groundingReferences = undefined;
  if (projectId) {
    try {
      const rows = await findReferenceRowsLite(projectId, opts?.userId);
      let refs = refsFromLiteRows(rows);
      const texts = [project.abstract ?? "", ...Object.values(project.sections ?? {})];
      const gate = evaluateCitationGate({
        texts,
        refCount: rows.length,
      });
      refs = await enrichCitedRefsWithPassages({
        projectId,
        draftText: texts.join("\n\n"),
        references: refs,
        citedNumbers: gate.uniqueNumbers,
      });
      groundingReferences = refs;
    } catch {
      groundingReferences = undefined;
    }
  }

  return assessExportReadiness(project, { bibOnlyIndexes, groundingReferences });
}
