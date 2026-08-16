/**
 * 引用「原文三态」判定（从 source/route.ts 抽离，供 validate_citations 复用）。
 *
 * 三态语义与 `GET /api/projects/:id/references/source` 一致：
 *   - full      知识库 PDF（sourceName 可 getFullText 命中）
 *   - abstract  外部导入摘要（无 PDF 全文，有 Reference.abstract）
 *   - bib_only  仅书目（无全文无摘要）
 *
 * 性能折中：只对「abstract 为空」的文献查全文；有摘要的直接判 abstract。
 * 对「bib_only 精确数据告警」而言结果与 source/route 完全一致——
 * 有摘要的文献不可能落 bib_only，无需为区分 full/abstract 多读一次文件。
 */

import { localRAG } from "@/lib/rag";
import { findReferenceRowsLite } from "@/lib/reference-rows";
import prisma from "@/lib/prisma";

export type ReferenceSourceMode = "full" | "abstract" | "bib_only";

/** 1-based 编号 → 三态 */
export type ReferenceModeMap = Map<number, ReferenceSourceMode>;

/** 返回「仅书目（无全文无摘要）」的 1-based 编号集合 */
export async function resolveBibOnlyIndexes(
  projectId: string,
  userId?: string,
): Promise<Set<number>> {
  const modes = await resolveReferenceModes(projectId, userId);
  const bibOnly = new Set<number>();
  for (const [idx, mode] of modes) {
    if (mode === "bib_only") bibOnly.add(idx);
  }
  return bibOnly;
}

export async function resolveReferenceModes(
  projectId: string,
  userId?: string,
): Promise<ReferenceModeMap> {
  const rows = await findReferenceRowsLite(projectId, userId);

  // sourceName 映射（refIndex 为 1 基）
  const sources = await prisma.referenceSource.findMany({
    where: { projectId },
    select: { refIndex: true, sourceName: true },
  });
  const sourceByIndex = new Map(sources.map((s) => [s.refIndex, s.sourceName]));

  const modes: ReferenceModeMap = new Map();
  for (const row of rows) {
    const idx = row.order + 1;
    const abstract = row.abstract?.trim();
    const sourceName = sourceByIndex.get(idx)?.trim();

    if (abstract) {
      modes.set(idx, "abstract");
      continue;
    }

    // 无摘要：需查全文才能区分 full / bib_only
    let mode: ReferenceSourceMode = "bib_only";
    if (sourceName) {
      try {
        const fullText = await localRAG.getFullText(sourceName);
        if (fullText.trim()) mode = "full";
      } catch {
        mode = "bib_only";
      }
    }
    modes.set(idx, mode);
  }

  return modes;
}
