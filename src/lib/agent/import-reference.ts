import type { ExternalLiteratureHit } from "@/contracts/literature";
import { formatExternalLiteratureHit } from "@/lib/external-literature-format";
import {
  ingestExternalHitToKnowledge,
  ingestExternalHitsToKnowledge,
} from "@/lib/external-knowledge-ingest";
import { hitToReferenceMeta } from "@/lib/reference-evidence";
import {
  createReferenceWithEvidence,
  loadReferenceDedupKeys,
} from "@/lib/reference-rows";
import { syncProjectPaperPassport } from "@/lib/project-paper-passport-sync";
import prisma from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("agent/import-reference");

export interface ImportKnowledgeBridgeOptions {
  directionSlug?: string;
  researchDirection?: string;
  /** 默认 true：同步写入方向/外部摘要知识库 */
  ingestToKnowledge?: boolean;
}

export interface ImportAgentReferenceResult {
  citation: string;
  referenceCount: number;
  hasAbstract: boolean;
  knowledge?: {
    name: string;
    category: string;
    mode: "abstract" | "bib_only" | "pdf";
  };
}

export interface ImportAgentReferencesBatchResult {
  imported: number;
  skippedDuplicate: number;
  citations: string[];
  referenceCount: number;
  withAbstract: number;
  knowledgeCreated?: number;
  knowledgeWithAbstract?: number;
  knowledgeWithPdf?: number;
}

function isDuplicateHit(
  hit: ExternalLiteratureHit,
  citation: string,
  existingContents: Set<string>,
  existingDois: Set<string>,
): boolean {
  if (existingContents.has(citation.trim())) return true;
  const doi = hit.doi?.trim().toLowerCase();
  if (doi && existingDois.has(doi)) return true;
  // 题录行里已含 DOI: xxx 时也去重
  if (doi && [...existingContents].some((c) => c.toLowerCase().includes(doi))) {
    return true;
  }
  return false;
}

async function resolveResearchDirection(
  userId: string,
  projectId: string,
  override?: string,
): Promise<string | undefined> {
  if (override?.trim()) return override.trim();
  const p = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { researchDirection: true },
  });
  return p?.researchDirection?.trim() || undefined;
}

/** Agent import_reference：外部文献写入项目参考文献（含摘要）+ 可选进知识库 */
export async function importExternalReferenceToProject(
  userId: string,
  projectId: string,
  hit: ExternalLiteratureHit,
  index?: number,
  bridge?: ImportKnowledgeBridgeOptions,
): Promise<ImportAgentReferenceResult> {
  const owned = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!owned) {
    throw new Error("项目不存在或无权访问");
  }

  const citation = formatExternalLiteratureHit(hit);
  const meta = hitToReferenceMeta(hit);
  const { contents, dois } = await loadReferenceDedupKeys(projectId);
  if (isDuplicateHit(hit, citation, contents, dois)) {
    throw new Error("该文献已在参考文献列表中");
  }

  await createReferenceWithEvidence(projectId, citation, meta, index);

  await prisma.project.update({
    where: { id: projectId },
    data: { lastUpdated: new Date() },
  });

  try {
    await syncProjectPaperPassport(projectId);
  } catch {
    /* 不阻塞导入 */
  }

  let knowledge: ImportAgentReferenceResult["knowledge"];
  if (bridge?.ingestToKnowledge !== false) {
    try {
      const researchDirection = await resolveResearchDirection(
        userId,
        projectId,
        bridge?.researchDirection,
      );
      const k = await ingestExternalHitToKnowledge({
        hit,
        directionSlug: bridge?.directionSlug,
        researchDirection,
      });
      knowledge = { name: k.name, category: k.category, mode: k.mode };
    } catch (e) {
      log.fail("ingest external hit to knowledge failed", e, {
        title: hit.title?.slice(0, 80),
        doi: hit.doi,
      });
    }
  }

  const referenceCount = await prisma.reference.count({ where: { projectId } });
  return {
    citation,
    referenceCount,
    hasAbstract: Boolean(meta.abstract),
    knowledge,
  };
}

/** 批量导入；已存在的跳过，不整批失败 */
export async function importExternalReferencesToProject(
  userId: string,
  projectId: string,
  hits: ExternalLiteratureHit[],
  bridge?: ImportKnowledgeBridgeOptions,
  /** 进度回调（done/total/title），供 agent/progress 实时反馈 */
  onProgress?: (done: number, total: number, title: string) => void,
): Promise<ImportAgentReferencesBatchResult> {
  const owned = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!owned) {
    throw new Error("项目不存在或无权访问");
  }

  const { contents: existingContents, dois: existingDois } =
    await loadReferenceDedupKeys(projectId);

  const acceptedHits: ExternalLiteratureHit[] = [];
  const citations: string[] = [];
  let skippedDuplicate = 0;
  let withAbstract = 0;

  for (const hit of hits) {
    const citation = formatExternalLiteratureHit(hit);
    if (isDuplicateHit(hit, citation, existingContents, existingDois)) {
      skippedDuplicate += 1;
      continue;
    }
    existingContents.add(citation.trim());
    if (hit.doi?.trim()) existingDois.add(hit.doi.trim().toLowerCase());
    const meta = hitToReferenceMeta(hit);
    if (meta.abstract) withAbstract += 1;
    citations.push(citation);
    acceptedHits.push(hit);
  }

  for (let i = 0; i < acceptedHits.length; i++) {
    const hit = acceptedHits[i]!;
    const citation = citations[i]!;
    const meta = hitToReferenceMeta(hit);
    await createReferenceWithEvidence(projectId, citation, meta);
    onProgress?.(i + 1, acceptedHits.length, hit.title?.trim().slice(0, 80) || "未命名文献");
  }

  if (acceptedHits.length > 0) {
    await prisma.project.update({
      where: { id: projectId },
      data: { lastUpdated: new Date() },
    });
    try {
      await syncProjectPaperPassport(projectId);
    } catch {
      /* 不阻塞 */
    }
  }

  let knowledgeCreated = 0;
  let knowledgeWithAbstract = 0;
  let knowledgeWithPdf = 0;
  if (acceptedHits.length > 0 && bridge?.ingestToKnowledge !== false) {
    try {
      const researchDirection = await resolveResearchDirection(
        userId,
        projectId,
        bridge?.researchDirection,
      );
      const k = await ingestExternalHitsToKnowledge(
        acceptedHits,
        {
          directionSlug: bridge?.directionSlug,
          researchDirection,
        },
        onProgress,
      );
      knowledgeCreated = k.created;
      knowledgeWithAbstract = k.withAbstract;
      knowledgeWithPdf = k.withPdf;
    } catch (e) {
      log.fail("batch ingest external hits to knowledge failed", e, {
        hitCount: acceptedHits.length,
      });
    }
  }

  const referenceCount = await prisma.reference.count({ where: { projectId } });
  return {
    imported: citations.length,
    skippedDuplicate,
    citations,
    referenceCount,
    withAbstract,
    knowledgeCreated,
    knowledgeWithAbstract,
    knowledgeWithPdf,
  };
}
