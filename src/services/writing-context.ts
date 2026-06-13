/** 写作上下文构建 — RAG 检索、预览与引用映射 */

import { ensureBibMapLoaded, localRAG, formatRagCitation, cleanSourceName, resolveBibEntry } from "@/lib/rag";
import type { RagChunk } from "@/lib/rag";
import type { WritingRequest } from "@/contracts/writing";
import { resolveWritingDraftContext } from "@/contracts/writing";
import type {
  RetrievePreviewHit,
  RetrievePreviewRequest,
  RetrievePreviewResponse,
} from "@/contracts/writing-retrieve-preview";

export interface WritingContext {
  contextText: string;
  refMapping: Record<string, number>;
  referencesByIndex: string[];
  newSources: string[];
  ragLimit: number;
  ragMaxPerSource: number;
  refRangeHint: string;
}

const RESEARCH_SECTION_KEYWORDS: Record<string, string> = {
  abstract: "综述 研究背景 研究目的 主要结果 结论",
  introduction: "研究背景 综述 研究现状 存在问题 研究进展",
  methods: "实验方法 制备 表征 测试 合成 优化",
  results: "实验数据 结果分析 性能对比 机理 影响因素",
  conclusion: "结论 展望 应用前景 创新点 贡献",
};

const REVIEW_SECTION_KEYWORDS: Record<string, string> = {
  abstract: "综述 研究进展 主要结论 展望 文献综合",
  introduction: "研究背景 综述必要性 研究脉络 文献不足 结构安排",
  background: "研究现状 概念框架 分类 主要问题 研究分布",
  literature_body: "研究进展 文献综合 对比 争议 主题综述 机制",
  conclusion: "综合结论 研究空白 未来方向 展望 启示",
};

function sectionKeywordsForMode(section: string, mode?: "review" | "research"): string {
  const map = mode === "research" ? RESEARCH_SECTION_KEYWORDS : REVIEW_SECTION_KEYWORDS;
  return map[section] || REVIEW_SECTION_KEYWORDS.introduction;
}

const retrievalConfigs: Record<string, { limit: number; maxPerSource: number }> = {
  precise: { limit: 10, maxPerSource: 2 },
  balanced: { limit: 20, maxPerSource: 3 },
  extensive: { limit: 60, maxPerSource: 6 },
};

export function buildWritingRetrievalQuery(params: {
  title: string;
  section: string;
  context?: string;
  bullets?: string[];
  researchDirection?: string;
  projectMode?: "review" | "research";
}): string {
  const sectionBoost = sectionKeywordsForMode(params.section, params.projectMode);
  const directionBoost = params.researchDirection || "";
  const draftContext = resolveWritingDraftContext(params.context, params.bullets);
  return [sectionBoost, directionBoost, params.title, draftContext].filter(Boolean).join(" ");
}

function getRetrievalConfig(retrievalMode?: string) {
  return retrievalConfigs[retrievalMode || "balanced"] || retrievalConfigs.balanced;
}

/**
 * 从已选参考文献反推知识库分类，用于把扩写检索收敛到相关分类（省内存/省加载）。
 * 解析不到分类时返回 undefined → search 回退全库（无引用的新项目即此情况）。
 */
function deriveScopeCategories(existingReferences?: string[]): string[] | undefined {
  if (!existingReferences || existingReferences.length === 0) return undefined;
  const cats = new Set<string>();
  for (const ref of existingReferences) {
    const entry = resolveBibEntry(ref);
    if (entry?.category && entry.category !== "未分类") cats.add(entry.category);
  }
  return cats.size > 0 ? Array.from(cats) : undefined;
}

/** 与扩写管道一致的 RAG 检索（含 fallback 查询） */
export async function searchWritingRagChunks(
  params: RetrievePreviewRequest,
): Promise<{ chunks: RagChunk[]; query: string; ragLimit: number; ragMaxPerSource: number }> {
  const { title, section, context, researchDirection, retrievalMode = "balanced", projectMode } = params;
  const { limit: ragLimit, maxPerSource: ragMaxPerSource } = getRetrievalConfig(retrievalMode);

  await ensureBibMapLoaded();

  // 已选文献所属分类 → 范围检索；解析不到则全库（向后兼容）
  const scopeCategories = deriveScopeCategories(params.existingReferences);
  const searchScope =
    scopeCategories?.length === 1
      ? { category: scopeCategories[0] }
      : {};

  const enhancedQuery = buildWritingRetrievalQuery({
    title,
    section,
    context,
    bullets: params.bullets,
    researchDirection,
    projectMode,
  });

  let chunks = await localRAG.search(enhancedQuery, {
    limit: ragLimit,
    maxPerSource: ragMaxPerSource,
    ...searchScope,
  });

  if (chunks.length === 0) {
    const sectionBoost = sectionKeywordsForMode(section, projectMode);
    const directionBoost = researchDirection || "";
    const fallbackQuery = [sectionBoost, directionBoost, title].filter(Boolean).join(" ");
    chunks = await localRAG.search(fallbackQuery, {
      limit: ragLimit,
      maxPerSource: Math.max(1, Math.floor(ragMaxPerSource / 2)),
      ...searchScope,
    });
  }

  return { chunks, query: enhancedQuery, ragLimit, ragMaxPerSource };
}

function buildExistingRefMapping(existingReferences: string[]) {
  const refMapping: Record<string, number> = {};
  existingReferences.forEach((ref, i) => {
    refMapping[ref] = i + 1;
  });
  return refMapping;
}

function resolveRefIndexForSource(
  rawSource: string,
  refMapping: Record<string, number>,
): number | null {
  if (refMapping[rawSource] != null) return refMapping[rawSource];
  const cleaned = cleanSourceName(rawSource);
  if (refMapping[cleaned] != null) return refMapping[cleaned];
  return null;
}

function normalizeSourceKey(rawSource: string): string | null {
  if (!rawSource || rawSource === "unknown") return null;
  return rawSource;
}

function chunkMatchesSelectedSource(rawSource: string, selectedSourceIds: string[]): boolean {
  const key = normalizeSourceKey(rawSource);
  if (!key) return false;
  if (selectedSourceIds.includes(key)) return true;
  return selectedSourceIds.includes(cleanSourceName(key));
}

function filterChunksBySelection(chunks: RagChunk[], selectedSourceIds: string[] | undefined): RagChunk[] {
  if (selectedSourceIds === undefined) return chunks;
  if (selectedSourceIds.length === 0) return [];
  return chunks.filter((c) => chunkMatchesSelectedSource(c.metadata.source, selectedSourceIds));
}

/** 将 RAG chunks 聚合为预览列表（按 source 分组） */
export function buildRetrievePreviewFromChunks(
  chunks: RagChunk[],
  existingReferences: string[],
  query: string,
): RetrievePreviewResponse {
  const refMapping = buildExistingRefMapping(existingReferences);
  const grouped = new Map<
    string,
    { chunks: RagChunk[]; category: string }
  >();

  for (const chunk of chunks) {
    const sourceKey = normalizeSourceKey(chunk.metadata.source);
    if (!sourceKey) continue;
    const existing = grouped.get(sourceKey);
    if (existing) {
      existing.chunks.push(chunk);
    } else {
      grouped.set(sourceKey, { chunks: [chunk], category: chunk.metadata.category || "" });
    }
  }

  const hits: RetrievePreviewHit[] = [];
  for (const [sourceKey, { chunks: sourceChunks, category }] of grouped) {
    const best = sourceChunks[0];
    const snippet = best.content.replace(/\n/g, " ").slice(0, 220).trim();
    const refIndex = resolveRefIndexForSource(sourceKey, refMapping);
    const entry = resolveBibEntry(sourceKey);
    const bib = entry?.bib;

    hits.push({
      sourceKey,
      displayName: bib?.title?.slice(0, 80) || cleanSourceName(sourceKey),
      refIndex,
      isNew: refIndex == null,
      snippet: snippet + (best.content.length > 220 ? "…" : ""),
      chunkCount: sourceChunks.length,
      category,
      bib: bib
        ? {
            title: bib.title,
            firstAuthor: bib.firstAuthor,
            year: bib.year,
            journal: bib.journal,
            doi: bib.doi,
          }
        : undefined,
    });
  }

  hits.sort((a, b) => {
    if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
    return b.chunkCount - a.chunkCount;
  });

  return {
    hits,
    defaultSelectedSourceIds: hits.map((h) => h.sourceKey),
    query,
    hitCount: hits.length,
  };
}

export async function retrieveWritingPreview(
  params: RetrievePreviewRequest,
): Promise<RetrievePreviewResponse> {
  const { chunks, query } = await searchWritingRagChunks(params);
  return buildRetrievePreviewFromChunks(chunks, params.existingReferences || [], query);
}

export async function retrieveWritingContext(
  params: WritingRequest,
  existingReferences: string[],
): Promise<WritingContext> {
  const { retrievalMode = "balanced", selectedSourceIds } = params;
  const { limit: ragLimit, maxPerSource: ragMaxPerSource } = getRetrievalConfig(retrievalMode);

  const { chunks: rawChunks } = await searchWritingRagChunks({
    title: params.title,
    section: params.section,
    context: params.context,
    bullets: params.bullets,
    researchDirection: params.researchDirection,
    retrievalMode,
    projectMode: params.projectMode,
    existingReferences,
  });

  const contextChunks = filterChunksBySelection(rawChunks, selectedSourceIds);

  const refMapping: Record<string, number> = {};
  const referencesByIndex: string[] = [];
  const newSources: string[] = [];
  existingReferences.forEach((ref: string, i: number) => {
    refMapping[ref] = i + 1;
    referencesByIndex[i] = ref;
  });

  const contextRefIndices: number[] = [];

  const contextText =
    contextChunks.length > 0
      ? contextChunks
          .map((c) => {
            const rawSource = c.metadata.source;
            if (!rawSource || rawSource === "unknown") return c.content;
            const sourceKey = rawSource;
            const sourceDisplay = cleanSourceName(rawSource);
            let globalIndex: number;
            if (refMapping[sourceKey] != null) {
              globalIndex = refMapping[sourceKey];
            } else if (refMapping[sourceDisplay] != null) {
              globalIndex = refMapping[sourceDisplay];
            } else {
              globalIndex = Object.keys(refMapping).length + 1;
              refMapping[sourceKey] = globalIndex;
              referencesByIndex[globalIndex - 1] = sourceKey;
              newSources.push(sourceKey);
            }
            if (!contextRefIndices.includes(globalIndex)) contextRefIndices.push(globalIndex);
            const cleanedContent = c.content.replace(/\[(\d+[\d,\s\-–—，、]*)\]/g, "[文献$1]");
            return `[参考来源 [${globalIndex}]: ${formatRagCitation(c)}]\n${cleanedContent}`;
          })
          .join("\n\n")
      : selectedSourceIds !== undefined && selectedSourceIds.length === 0
        ? "（未选择任何文献来源，请根据通用学术知识扩写，避免编造具体数据）"
        : "（未找到直接相关的文献参考，请根据通用学术知识扩写）";

  const totalRefs = referencesByIndex.length;
  const contextRefs = contextRefIndices.sort((a, b) => a - b);
  const contextRefSet = new Set(contextRefs);

  const allRefListLines: string[] = [];
  for (let i = 0; i < referencesByIndex.length; i++) {
    const filename = referencesByIndex[i];
    if (!filename) continue;
    const idx = i + 1;
    const entry = resolveBibEntry(filename);
    const bib = entry?.bib;
    const gbTag = entry?.gbTag ? `[${entry.gbTag}]` : "";
    const isNew = contextRefSet.has(idx);
    let line: string;
    if (bib?.firstAuthor || bib?.year || bib?.journal || bib?.doi) {
      const author = bib.firstAuthor
        ? `${bib.firstAuthor}${Array.isArray(bib.authors) && bib.authors.length > 1 ? " 等" : ""}`
        : "";
      const year = bib.year ? ` (${bib.year})` : "";
      const titleText = bib.title ? ` "${bib.title.slice(0, 60)}${bib.title.length > 60 ? "…" : ""}"` : "";
      const journal = bib.journal ? ` ${bib.journal}` : "";
      line = `  [${idx}]${gbTag} ${author}${year}${titleText}${journal}`;
    } else {
      line = `  [${idx}] ${cleanSourceName(filename)}`;
    }
    if (isNew) line += " ★本次检索";
    allRefListLines.push(line);
  }

  const refRangeHint =
    totalRefs > 0
      ? `\n⚠️ 项目共有 ${totalRefs} 篇文献。★本次检索 表示有全文RAG上下文可深度引用；未标星的为已在项目中的文献，可引用但仅有标题/作者信息。引用时一律使用 [n] 编号，编号须与下列列表严格对应。\n完整文献列表：\n${allRefListLines.join("\n")}`
      : "";

  return { contextText, refMapping, referencesByIndex, newSources, ragLimit, ragMaxPerSource, refRangeHint };
}
