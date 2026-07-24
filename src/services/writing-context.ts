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
  /** 本次有 RAG 全文片段、允许深度引用的编号 */
  groundedRefIndices: number[];
  /** 是否因范围空命中而扩到全库 */
  expandedToFullLibrary: boolean;
  /** 是否因主题相关性丢掉了部分命中 */
  topicFiltered?: boolean;
  /** 主题过滤过严、退回 soft top-K */
  topicSoftKept?: boolean;
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

/** 合并已有参考文献 + 用户勾选来源，作为 scope 候选 */
export function mergeScopeSourceKeys(
  existingReferences?: string[],
  selectedSourceIds?: string[],
): string[] {
  const set = new Set<string>();
  for (const r of existingReferences || []) {
    if (r?.trim()) set.add(r.trim());
  }
  // undefined = 未勾选流程，不额外加入；空数组 = 明确零选，也不加
  if (selectedSourceIds) {
    for (const r of selectedSourceIds) {
      if (r?.trim()) set.add(r.trim());
    }
  }
  return Array.from(set);
}

/**
 * 从 source key 反推知识库分类（跳过「未分类」）。
 * 供 scope 收敛；解析不到则不贡献分类。
 */
export function collectCategoriesFromSources(sources: string[]): string[] {
  const cats = new Set<string>();
  for (const raw of sources) {
    const entry = resolveBibEntry(raw) || resolveBibEntry(cleanSourceName(raw));
    if (entry?.category && entry.category !== "未分类") cats.add(entry.category);
  }
  return Array.from(cats);
}

/** 分类列表 → localRAG.search 的 scope 参数 */
export function toRagSearchScope(
  categories: string[],
): { category: string } | { categories: string[] } | Record<string, never> {
  if (categories.length === 0) return {};
  if (categories.length === 1) return { category: categories[0] };
  return { categories };
}

/** 题目/方向 → 知识库分类提示（无已有文献时收窄检索） */
const TITLE_CATEGORY_HINTS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /茶|绿茶|红茶|乌龙|普洱|香气|挥发性|杀青|摊放|茶汤/, category: "茶学" },
  { pattern: /烟花|烟火|推进剂|含能|火药|燃烧剂|高氯酸/, category: "烟花" },
  { pattern: /烤烟|烟草|烟叶|植烟|卷烟/, category: "烟草" },
  { pattern: /热解|共热解|热化学|裂解|生物质.*塑料|碳纳米|秸秆.*热解|营养元素.*迁移/, category: "热化学" },
  { pattern: /控释|缓释|包衣|包膜|肥料|氮素淋|生物炭基肥/, category: "控释肥类" },
  { pattern: /生物炭|biochar/i, category: "烟草" },
];

/**
 * 从标题/方向推断可能相关的知识库分类（可与已有文献分类并集）。
 */
export function inferCategoriesFromTitle(...texts: Array<string | undefined>): string[] {
  const blob = texts.filter(Boolean).join(" ");
  if (!blob.trim()) return [];
  const cats = new Set<string>();
  for (const { pattern, category } of TITLE_CATEGORY_HINTS) {
    if (pattern.test(blob)) cats.add(category);
  }
  return Array.from(cats);
}

/**
 * 扩写检索分类范围 = 已有参考文献 ∪ 用户勾选文献 的分类并集；
 * 若仍为空，则用题名/方向关键词提示分类（避免全库跑偏）。
 */
export function resolveWritingSearchScope(opts: {
  existingReferences?: string[];
  selectedSourceIds?: string[];
  title?: string;
  researchDirection?: string;
  context?: string;
}): { category?: string; categories?: string[] } {
  const sources = mergeScopeSourceKeys(opts.existingReferences, opts.selectedSourceIds);
  const fromSources = collectCategoriesFromSources(sources);
  if (fromSources.length > 0) return toRagSearchScope(fromSources);
  const hinted = inferCategoriesFromTitle(opts.title, opts.researchDirection, opts.context);
  return toRagSearchScope(hinted);
}

function hasActiveScope(scope: { category?: string; categories?: string[] }): boolean {
  return Boolean(scope.category || (scope.categories && scope.categories.length > 0));
}

/** 题目/方向里抽取的主题词（用于检索后相关性过滤） */
const TOPIC_STOPWORDS = new Set([
  "研究",
  "进展",
  "综述",
  "技术",
  "机制",
  "方法",
  "分析",
  "影响",
  "应用",
  "发展",
  "现状",
  "问题",
  "对策",
  "探讨",
  "浅谈",
  "基于",
  "及其",
  "与",
  "的",
  "和",
  "及",
  "对",
  "在",
  "中",
  "下",
  "为",
  "了",
  "等",
  "并",
  "或",
  "一种",
  "若干",
  "相关",
  "系统",
  "综合",
  "展望",
  "结论",
  "引言",
  "文献",
  "论文",
  "review",
  "research",
  "progress",
  "study",
  "analysis",
]);

/**
 * 从标题/方向/要点中提取主题词（优先中文 2–8 字完整片段与较长英文词）。
 * 不做全量滑动窗口，避免「形成/机制」等碎词污染相关性过滤。
 */
export function extractTopicTerms(...texts: Array<string | undefined>): string[] {
  const bag = new Set<string>();
  for (const raw of texts) {
    if (!raw?.trim()) continue;
    const text = raw.trim();
    for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9\-]{2,}/g)) {
      const w = m[0].toLowerCase();
      if (!TOPIC_STOPWORDS.has(w)) bag.add(w);
    }
    // 按标点切开后保留整段；再按常见连接词拆成短语
    const cleaned = text
      .replace(/[A-Za-z0-9]/g, " ")
      .replace(/[，。；、：？！“”‘’（）【】《》\s\-_/\\|]+/g, " ");
    for (const seg of cleaned.split(/\s+/).filter(Boolean)) {
      for (const part of seg.split(/[与及和的对在中]/).filter(Boolean)) {
        if (part.length >= 2 && part.length <= 12 && !TOPIC_STOPWORDS.has(part)) {
          bag.add(part);
          // 长词补 2～3 字词头/词尾，便于文件名与正文局部匹配
          if (part.length >= 4) {
            const head2 = part.slice(0, 2);
            const head3 = part.slice(0, 3);
            const tail2 = part.slice(-2);
            if (!TOPIC_STOPWORDS.has(head2)) bag.add(head2);
            if (!TOPIC_STOPWORDS.has(head3)) bag.add(head3);
            if (!TOPIC_STOPWORDS.has(tail2)) bag.add(tail2);
          }
        }
      }
    }
  }
  return Array.from(bag)
    .sort((a, b) => b.length - a.length || a.localeCompare(b, "zh"))
    .slice(0, 20);
}

/** 片段与主题词的命中分（文件名加权） */
export function scoreChunkTopicRelevance(chunk: RagChunk, terms: string[]): number {
  if (terms.length === 0) return 0;
  const source = (chunk.metadata.source || "").toLowerCase();
  const content = (chunk.content || "").toLowerCase().slice(0, 1200);
  let score = 0;
  for (const term of terms) {
    const t = term.toLowerCase();
    if (source.includes(t)) score += 3;
    if (content.includes(t)) score += 1;
  }
  return score;
}

/**
 * 按题目主题过滤/重排 RAG 命中：丢掉明显跑题片段，但至少保留 keepAtLeast 条。
 * pinSources 中的来源（已有参考文献）一律保留。
 */
export function filterChunksByTopicRelevance(
  chunks: RagChunk[],
  terms: string[],
  opts?: {
    minScore?: number;
    keepAtLeast?: number;
    pinSources?: string[];
  },
): { chunks: RagChunk[]; dropped: number; softKept: boolean } {
  if (chunks.length === 0 || terms.length === 0) {
    return { chunks, dropped: 0, softKept: false };
  }
  const minScore = opts?.minScore ?? 1;
  const keepAtLeast = opts?.keepAtLeast ?? Math.min(6, chunks.length);
  const pin = new Set((opts?.pinSources || []).map((s) => s.trim()).filter(Boolean));

  const scored = chunks.map((c) => ({
    c,
    s: scoreChunkTopicRelevance(c, terms),
    pinned: pin.has(c.metadata.source) || pin.has(c.metadata.source.replace(/\.pdf$/i, "")),
  }));

  const hard = scored.filter((x) => x.pinned || x.s >= minScore);
  if (hard.length >= Math.min(3, keepAtLeast)) {
    hard.sort((a, b) => b.s - a.s || (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    return {
      chunks: hard.map((x) => x.c),
      dropped: chunks.length - hard.length,
      softKept: false,
    };
  }

  // 几乎全跑题：仍按相关分取 top，避免检索结果变空
  scored.sort((a, b) => b.s - a.s);
  const soft = scored.slice(0, keepAtLeast).map((x) => x.c);
  return {
    chunks: soft,
    dropped: Math.max(0, chunks.length - soft.length),
    softKept: true,
  };
}

/** 与扩写管道一致的 RAG 检索（含 query fallback + 范围空命中扩全库 + 主题过滤） */
export async function searchWritingRagChunks(
  params: RetrievePreviewRequest & { selectedSourceIds?: string[] },
): Promise<{
  chunks: RagChunk[];
  query: string;
  ragLimit: number;
  ragMaxPerSource: number;
  expandedToFullLibrary: boolean;
  topicFiltered?: boolean;
  topicSoftKept?: boolean;
}> {
  const {
    title,
    section,
    context,
    researchDirection,
    retrievalMode = "balanced",
    projectMode,
    selectedSourceIds,
  } = params;
  const { limit: ragLimit, maxPerSource: ragMaxPerSource } = getRetrievalConfig(retrievalMode);

  await ensureBibMapLoaded();

  const searchScope = resolveWritingSearchScope({
    existingReferences: params.existingReferences,
    selectedSourceIds,
    title,
    researchDirection,
    context,
  });
  const scoped = hasActiveScope(searchScope);

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
  let expandedToFullLibrary = false;

  // query fallback：仍保留要点语义（draftContext），勿只剩章节词
  if (chunks.length === 0) {
    const draftContext = resolveWritingDraftContext(context, params.bullets);
    const sectionBoost = sectionKeywordsForMode(section, projectMode);
    const directionBoost = researchDirection || "";
    const fallbackQuery = [sectionBoost, directionBoost, title, draftContext]
      .filter(Boolean)
      .join(" ")
      .slice(0, 800);
    chunks = await localRAG.search(fallbackQuery || enhancedQuery, {
      limit: ragLimit,
      maxPerSource: Math.max(1, Math.floor(ragMaxPerSource / 2)),
      ...searchScope,
    });
  }

  // scope fallback：分类收窄导致 0 命中 → 扩到全库（同一 query）
  if (chunks.length === 0 && scoped) {
    chunks = await localRAG.search(enhancedQuery, {
      limit: ragLimit,
      maxPerSource: ragMaxPerSource,
    });
    expandedToFullLibrary = chunks.length > 0;
  }

  const topicTerms = extractTopicTerms(title, researchDirection, context);
  const filtered = filterChunksByTopicRelevance(chunks, topicTerms, {
    pinSources: mergeScopeSourceKeys(params.existingReferences, selectedSourceIds),
    keepAtLeast: Math.min(6, Math.max(3, Math.floor(ragLimit / 3))),
  });

  return {
    chunks: filtered.chunks,
    query: enhancedQuery,
    ragLimit,
    ragMaxPerSource,
    expandedToFullLibrary,
    topicFiltered: filtered.dropped > 0,
    topicSoftKept: filtered.softKept,
  };
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

function formatRefListLine(idx: number, filename: string): string {
  const entry = resolveBibEntry(filename);
  const bib = entry?.bib;
  const gbTag = entry?.gbTag ? `[${entry.gbTag}]` : "";
  if (bib?.firstAuthor || bib?.year || bib?.journal || bib?.doi) {
    const author = bib.firstAuthor
      ? `${bib.firstAuthor}${Array.isArray(bib.authors) && bib.authors.length > 1 ? " 等" : ""}`
      : "";
    const year = bib.year ? ` (${bib.year})` : "";
    const titleText = bib.title
      ? ` "${bib.title.slice(0, 60)}${bib.title.length > 60 ? "…" : ""}"`
      : "";
    const journal = bib.journal ? ` ${bib.journal}` : "";
    return `  [${idx}]${gbTag} ${author}${year}${titleText}${journal}`;
  }
  return `  [${idx}] ${cleanSourceName(filename)}`;
}

/**
 * 构建引用范围提示：可深度引用（有 chunk）vs 仅书目（勿深引）。
 * 纯函数便于单测。
 */
export function buildWritingRefRangeHint(params: {
  referencesByIndex: string[];
  groundedRefIndices: number[];
  expandedToFullLibrary?: boolean;
}): string {
  const { referencesByIndex, groundedRefIndices, expandedToFullLibrary } = params;
  const totalRefs = referencesByIndex.filter(Boolean).length;
  if (totalRefs === 0 && groundedRefIndices.length === 0) return "";

  const groundedSet = new Set(groundedRefIndices);
  const groundedLines: string[] = [];
  const bibOnlyLines: string[] = [];

  for (let i = 0; i < referencesByIndex.length; i++) {
    const filename = referencesByIndex[i];
    if (!filename) continue;
    const idx = i + 1;
    const line = formatRefListLine(idx, filename);
    if (groundedSet.has(idx)) groundedLines.push(`${line} ★有全文`);
    else bibOnlyLines.push(line);
  }

  const groundedNums = [...groundedSet].sort((a, b) => a - b);
  const expandNote = expandedToFullLibrary
    ? "\n（提示：分类范围检索无命中，已自动扩大到全库。）"
    : "";

  return `
⚠️ 引用铁律：
· **可深度引用**的编号仅限：${groundedNums.length > 0 ? groundedNums.map((n) => `[${n}]`).join("、") : "（无）"}——这些来源有 RAG 全文片段，可用 [n] 支撑具体观点/数据。
· **仅书目**编号（无全文片段）**禁止**引用具体数据、统计结果或细致结论；一般不要使用这些 [n]。若必须提及，只用极概括表述且不加编号。
· 严禁编造列表外的编号。${expandNote}

【可深度引用 · 有 RAG 全文】
${groundedLines.length > 0 ? groundedLines.join("\n") : "  （无）"}

【仅书目 · 勿深引】
${bibOnlyLines.length > 0 ? bibOnlyLines.join("\n") : "  （无）"}
`;
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
    const fullText = sourceChunks
      .map((c) => c.content)
      .join("\n\n")
      .slice(0, 3000)
      .trim();
    const refIndex = resolveRefIndexForSource(sourceKey, refMapping);
    const entry = resolveBibEntry(sourceKey);
    const bib = entry?.bib;

    hits.push({
      sourceKey,
      displayName: bib?.title?.slice(0, 80) || cleanSourceName(sourceKey),
      refIndex,
      isNew: refIndex == null,
      snippet: snippet + (best.content.length > 220 ? "…" : ""),
      fullText,
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

  const {
    chunks: rawChunks,
    expandedToFullLibrary,
    topicFiltered,
    topicSoftKept,
  } = await searchWritingRagChunks({
    title: params.title,
    section: params.section,
    context: params.context,
    bullets: params.bullets,
    researchDirection: params.researchDirection,
    retrievalMode,
    projectMode: params.projectMode,
    existingReferences,
    selectedSourceIds,
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

  const groundedRefIndices = contextRefIndices.sort((a, b) => a - b);
  const refRangeHint = buildWritingRefRangeHint({
    referencesByIndex,
    groundedRefIndices,
    expandedToFullLibrary,
  });

  return {
    contextText,
    refMapping,
    referencesByIndex,
    newSources,
    ragLimit,
    ragMaxPerSource,
    refRangeHint,
    groundedRefIndices,
    expandedToFullLibrary,
    topicFiltered,
    topicSoftKept,
  };
}
