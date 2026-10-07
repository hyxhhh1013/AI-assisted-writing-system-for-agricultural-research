/**
 * 外部导入的参考文献带摘要，但 ReferenceSource 往往没挂知识库 PDF。
 * 引用弹窗按 DOI 回查 size>0 的 .pdf，命中后把文件名写回 ReferenceSource。
 */

import { normalizeBibliographyDoi } from "@/lib/bib-import/doi";
import prisma from "@/lib/prisma";

export interface KnowledgePdfCandidate {
  name: string;
  category: string;
  size: number;
  chunkCount: number;
  bibDoi?: string | null;
}

export interface KnowledgePdfHit {
  name: string;
  category: string;
}

export function isKnowledgePdfName(name: string | null | undefined): boolean {
  return Boolean(name?.trim().toLowerCase().endsWith(".pdf"));
}

/** 同一 DOI 多条时优先已索引（chunkCount），其次文件更大。 */
export function pickKnowledgePdf(
  doi: string,
  rows: KnowledgePdfCandidate[],
): KnowledgePdfHit | null {
  const canon = normalizeBibliographyDoi(doi);
  if (!canon) return null;
  const hits = rows.filter((row) => {
    if (row.size <= 0 || !isKnowledgePdfName(row.name)) return false;
    return normalizeBibliographyDoi(row.bibDoi) === canon;
  });
  hits.sort((a, b) => b.chunkCount - a.chunkCount || b.size - a.size);
  const best = hits[0];
  return best ? { name: best.name, category: best.category } : null;
}

export async function findKnowledgePdfByDoi(doi: string): Promise<KnowledgePdfHit | null> {
  const canon = normalizeBibliographyDoi(doi);
  if (!canon) return null;
  const rows = await prisma.knowledgeFile.findMany({
    where: { bib: { contains: canon }, size: { gt: 0 } },
    select: { name: true, category: true, size: true, chunkCount: true, bib: true },
    take: 20,
  });
  const candidates: KnowledgePdfCandidate[] = [];
  for (const row of rows) {
    let bibDoi: string | null = null;
    try {
      const bib = row.bib ? (JSON.parse(row.bib) as { doi?: string }) : null;
      bibDoi = bib?.doi ?? null;
    } catch {
      bibDoi = null;
    }
    candidates.push({
      name: row.name,
      category: row.category,
      size: row.size,
      chunkCount: row.chunkCount,
      bibDoi,
    });
  }
  return pickKnowledgePdf(canon, candidates);
}

export async function upsertReferencePdfSource(input: {
  projectId: string;
  refIndex: number;
  sourceName: string;
  category?: string;
  citation?: string;
}): Promise<void> {
  const sourceName = input.sourceName.trim();
  if (!isKnowledgePdfName(sourceName)) return;
  await prisma.referenceSource.upsert({
    where: { projectId_refIndex: { projectId: input.projectId, refIndex: input.refIndex } },
    update: {
      sourceName,
      category: input.category ?? "",
      citation: input.citation ?? "",
    },
    create: {
      projectId: input.projectId,
      refIndex: input.refIndex,
      sourceName,
      category: input.category ?? "",
      citation: input.citation ?? "",
    },
  });
}
