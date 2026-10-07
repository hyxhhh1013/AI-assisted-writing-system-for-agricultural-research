import type { ExternalLiteratureHit } from "@/contracts/literature";
import { formatExternalLiteratureHit } from "@/lib/external-literature-format";
import { formatReference } from "@/lib/ref-format";
import {
  canonicalizeLiteratureDoi,
  isNonCitableLiteratureHit,
} from "@/lib/literature-hit-quality";
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
import { upsertReferencePdfSource } from "@/lib/reference-pdf-link";
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
  skippedNonCitable: number;
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
  const doi = canonicalizeLiteratureDoi(hit.doi);
  if (!doi) return false;
  if (existingDois.has(doi)) return true;
  for (const c of existingContents) {
    const fromLine = canonicalizeLiteratureDoi(c.match(/DOI:\s*(10\.\S+)/i)?.[1]);
    if (fromLine && fromLine === doi) return true;
    if (c.toLowerCase().includes(doi)) return true;
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
  if (isNonCitableLiteratureHit(hit)) {
    throw new Error("该条是审稿意见或非论文记录，已跳过");
  }
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

  const createdOrder = index !== undefined
    ? index
    : (
      await prisma.reference.findFirst({
        where: { projectId },
        orderBy: { order: "desc" },
        select: { order: true },
      })
    )?.order;

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
      if (k.mode === "pdf" && createdOrder !== undefined) {
        try {
          await upsertReferencePdfSource({
            projectId,
            refIndex: createdOrder + 1,
            sourceName: k.name,
            category: k.category,
            citation,
          });
        } catch (linkErr) {
          log.fail("link imported pdf to reference failed", linkErr, {
            title: hit.title?.slice(0, 80),
            doi: hit.doi,
          });
        }
      }
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
  let skippedNonCitable = 0;
  let withAbstract = 0;

  for (const hit of hits) {
    if (isNonCitableLiteratureHit(hit)) {
      skippedNonCitable += 1;
      continue;
    }
    const citation = formatExternalLiteratureHit(hit);
    if (isDuplicateHit(hit, citation, existingContents, existingDois)) {
      skippedDuplicate += 1;
      continue;
    }
    existingContents.add(citation.trim());
    const canon = canonicalizeLiteratureDoi(hit.doi);
    if (canon) existingDois.add(canon);
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

  const newestOrders = acceptedHits.length > 0
    ? (
      await prisma.reference.findMany({
        where: { projectId },
        orderBy: { order: "desc" },
        take: acceptedHits.length,
        select: { order: true },
      })
    ).map((row) => row.order)
    : [];

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
      for (let i = 0; i < k.results.length; i++) {
        const hitResult = k.results[i];
        if (!hitResult || hitResult.mode !== "pdf") continue;
        const order = newestOrders[acceptedHits.length - 1 - i];
        if (order === undefined) continue;
        try {
          await upsertReferencePdfSource({
            projectId,
            refIndex: order + 1,
            sourceName: hitResult.name,
            category: hitResult.category,
            citation: citations[i] ?? "",
          });
        } catch (linkErr) {
          log.fail("link imported pdf to reference failed", linkErr, {
            title: acceptedHits[i]?.title?.slice(0, 80),
          });
        }
      }
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
    skippedNonCitable,
    citations,
    referenceCount,
    withAbstract,
    knowledgeCreated,
    knowledgeWithAbstract,
    knowledgeWithPdf,
  };
}

export interface ImportKnowledgeFileInput {
  source: string;
  category?: string;
  citation?: string;
  excerpt?: string;
}

function basenameKey(name: string): string {
  const t = name.replace(/\\/g, "/").trim();
  const leaf = t.split("/").pop() ?? t;
  return leaf.toLowerCase();
}

/** 把本地知识库 PDF 写入项目参考文献，并挂 ReferenceSource.sourceName（可全文精读） */
export async function importKnowledgeFilesToProject(
  userId: string,
  projectId: string,
  files: ImportKnowledgeFileInput[],
): Promise<ImportAgentReferencesBatchResult> {
  const owned = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!owned) {
    throw new Error("项目不存在或无权访问");
  }

  const { contents } = await loadReferenceDedupKeys(projectId);
  const existingSources = await prisma.referenceSource.findMany({
    where: { projectId },
    select: { sourceName: true },
  });
  const existingKeys = new Set(existingSources.map((s) => basenameKey(s.sourceName)));

  const seen = new Set<string>();
  const accepted: ImportKnowledgeFileInput[] = [];
  let skippedDuplicate = 0;

  for (const file of files) {
    const source = file.source.trim();
    if (!source) continue;
    const key = basenameKey(source);
    if (!key || seen.has(key) || existingKeys.has(key)) {
      skippedDuplicate += 1;
      continue;
    }
    const citation =
      (file.citation ?? "").replace(/^\[\d+\]\s*/, "").trim()
      || formatReference(source, { style: "gbt7714" });
    if (contents.has(citation.trim())) {
      skippedDuplicate += 1;
      continue;
    }
    seen.add(key);
    contents.add(citation.trim());
    accepted.push({ ...file, source, citation });
  }

  const citations: string[] = [];
  let withAbstract = 0;
  for (const file of accepted) {
    const citation = file.citation ?? file.source;
    await createReferenceWithEvidence(projectId, citation, {
      title: citation.slice(0, 300),
      abstract: file.excerpt?.slice(0, 4000),
    });
    const last = await prisma.reference.findFirst({
      where: { projectId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const refIndex = (last?.order ?? 0) + 1;
    await prisma.referenceSource.upsert({
      where: { projectId_refIndex: { projectId, refIndex } },
      update: {
        sourceName: file.source,
        category: file.category ?? "",
        citation,
      },
      create: {
        projectId,
        refIndex,
        sourceName: file.source,
        category: file.category ?? "",
        citation,
      },
    });
    citations.push(citation);
    if (file.excerpt?.trim()) withAbstract += 1;
  }

  if (accepted.length > 0) {
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

  const referenceCount = await prisma.reference.count({ where: { projectId } });
  return {
    imported: citations.length,
    skippedDuplicate,
    skippedNonCitable: 0,
    citations,
    referenceCount,
    withAbstract,
    knowledgeCreated: 0,
    knowledgeWithAbstract: 0,
    knowledgeWithPdf: accepted.length,
  };
}
