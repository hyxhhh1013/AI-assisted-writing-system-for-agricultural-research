import type { KnowledgeBib } from "@/contracts/knowledge";
import { getKnowledgeIndexStatus } from "@/contracts/knowledge";
import type { AdminKnowledgeFile } from "@/contracts/admin";
import type { Prisma } from "@prisma/client";

interface KnowledgeFileRow {
  id: string;
  name: string;
  category: string;
  documentType: string;
  size: number;
  mtime: Date | null;
  bib: string | null;
  bibEdited: boolean;
  parseWarning: string | null;
  chunkCount: number;
  chunkRowCount?: number;
}

export function mapAdminKnowledgeFile(row: KnowledgeFileRow): AdminKnowledgeFile {
  let bib: KnowledgeBib | null = null;
  if (row.bib) {
    try {
      bib = JSON.parse(row.bib) as KnowledgeBib;
    } catch {
      bib = null;
    }
  }

  const chunkCount = row.chunkCount > 0 ? row.chunkCount : (row.chunkRowCount ?? 0);
  const indexInfo = getKnowledgeIndexStatus({
    chunkCount,
    bib,
    bibEdited: row.bibEdited,
    documentType: row.documentType,
    parseWarning: row.parseWarning as "no_text" | "low_text" | null,
    size: row.size,
    hasPdfOnDisk: row.size > 0,
  });

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    documentType: row.documentType,
    size: row.size,
    chunkCount,
    mtime: row.mtime?.toISOString() ?? null,
    parseWarning: row.parseWarning as AdminKnowledgeFile["parseWarning"],
    bibEdited: row.bibEdited,
    doi: bib?.doi?.trim() || null,
    indexStatus: indexInfo.status,
    indexLabel: indexInfo.label,
  };
}

/** 文献索引状态的 SQL 近似条件（bib 细节仍以 mapAdminKnowledgeFile 为准） */
export function knowledgeIndexStatusWhere(
  status: string,
): Prisma.KnowledgeFileWhereInput | null {
  if (status === "unindexed") {
    return { chunkCount: 0, parseWarning: null, size: { gt: 0 } };
  }
  if (status === "ready") {
    return { chunkCount: { gt: 0 }, parseWarning: null, size: { gt: 0 } };
  }
  if (status === "partial") {
    return {
      OR: [
        { parseWarning: { not: null } },
        { AND: [{ chunkCount: 0 }, { size: 0 }] },
        { AND: [{ chunkCount: { gt: 0 } }, { size: 0 }] },
      ],
    };
  }
  return null;
}
