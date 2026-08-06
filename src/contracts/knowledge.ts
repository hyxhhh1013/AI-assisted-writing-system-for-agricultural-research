/** 知识库文献元数据契约（前后端 + Prisma KnowledgeFile 共享） */

export type KnowledgeDocumentType =
  | "paper"
  | "journal"
  | "patent"
  | "book"
  | "other";

export type KnowledgeGbTag = "J" | "M" | "P" | "D" | "C" | "S";

/** 结构化书目字段（存于 KnowledgeFile.bib JSON） */
export interface KnowledgeBib {
  title?: string;
  authors?: string[];
  firstAuthor?: string;
  year?: number;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  /** 外部导入无 PDF 时可选存摘要（不进正式书目展示也可） */
  abstract?: string;
  issn?: string;
  eissn?: string;
  patentNumber?: string;
  inventors?: string[];
  applicant?: string;
  publicationDate?: string;
  isbn?: string;
  publisher?: string;
}

/** 单条知识库文献记录（API 列表项） */
export interface KnowledgeFileRecord {
  name: string;
  path?: string;
  category: string;
  chunkCount: number;
  size: number;
  mtime: string;
  documentType?: KnowledgeDocumentType | string;
  gbTag?: KnowledgeGbTag | string | null;
  bib?: KnowledgeBib | null;
  /** 用户手动编辑过书目信息后设为 true，重建索引时不覆盖 bib */
  bibEdited?: boolean;
  /** PDF 解析警告：no_text=扫描版/无文本层，low_text=文本极少 */
  parseWarning?: "no_text" | "low_text" | null;
  /** 语义搜索时附带的匹配片段（仅 API 响应） */
  _snippets?: string[];
  /** 磁盘上是否存在可读 PDF（列表 API 填充） */
  hasPdfOnDisk?: boolean;
  /** PDF 实际所在分类，与 category 不一致时表示元数据漂移 */
  diskCategory?: string;
  /** 期刊指标（ENG-PR-091 写入；090 预留展示） */
  metrics?: JournalMetrics | null;
}

/** 期刊影响因子 / 分区等指标（实验室表或 OpenAlex enrichment） */
export interface JournalMetrics {
  impactFactor?: number;
  impactFactorYear?: number;
  jcrQuartile?: string;
  casPartition?: string;
  isCoreJournal?: boolean;
  citedByCount?: number;
  openAccessUrl?: string;
  /** OpenAlex 期刊 2 年均被引（非 JCR IF） */
  oa2yrCitedness?: number;
  hIndex?: number;
}

export type KnowledgeDoiFilter = "all" | "has" | "missing";
export type KnowledgeIndexStatusFilter = "all" | KnowledgeIndexStatus;

export interface KnowledgeListFilters {
  journalContains?: string;
  indexStatus?: KnowledgeIndexStatusFilter;
  doi?: KnowledgeDoiFilter;
}

export type KnowledgeIndexStatus = "unindexed" | "partial" | "ready";

export interface KnowledgeIndexStatusInfo {
  status: KnowledgeIndexStatus;
  label: string;
  /** 缺失的关键书目字段 */
  missingFields: string[];
}

const GB_TAG_LABELS: Record<string, string> = {
  J: "期刊[J]",
  M: "专著[M]",
  P: "专利[P]",
  D: "学位[D]",
  C: "会议[C]",
  S: "标准[S]",
};

export function getGbTagLabel(gbTag?: string | null): string | null {
  if (!gbTag) return null;
  return GB_TAG_LABELS[gbTag] ?? gbTag;
}

export function getDocumentTypeLabel(documentType?: string): string {
  switch (documentType) {
    case "patent":
      return "专利";
    case "book":
      return "书籍";
    case "other":
      return "其他";
    case "journal":
    case "paper":
      return "论文";
    default:
      return "论文";
  }
}

function hasNonEmptyBibField(bib: KnowledgeBib | null | undefined, key: keyof KnowledgeBib): boolean {
  const value = bib?.[key];
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** 是否可在阅读器 / PDF 接口中打开 */
export function canOpenKnowledgePdf(
  file: Pick<KnowledgeFileRecord, "hasPdfOnDisk" | "size">,
): boolean {
  if (file.hasPdfOnDisk === false) return false;
  if (file.hasPdfOnDisk === true) return true;
  return (file.size ?? 0) > 0;
}

export function getKnowledgeIndexStatus(
  file: Pick<KnowledgeFileRecord, "chunkCount" | "bib" | "bibEdited" | "documentType" | "parseWarning" | "hasPdfOnDisk"> & {
    size?: number;
  },
): KnowledgeIndexStatusInfo {
  if (file.parseWarning === "no_text" || (file.chunkCount === 0 && file.parseWarning)) {
    return {
      status: "partial",
      label: "无文本层",
      missingFields: ["需 OCR 或换 PDF"],
    };
  }

  if (
    (!file.chunkCount || file.chunkCount <= 0)
    && (file.size === 0 || file.hasPdfOnDisk === false)
    && hasNonEmptyBibField(file.bib, "title")
  ) {
    return {
      status: "partial",
      label: "待上传 PDF",
      missingFields: ["PDF"],
    };
  }

  if (
    file.chunkCount
    && file.chunkCount > 0
    && (file.size === 0 || file.hasPdfOnDisk === false)
  ) {
    return {
      status: "partial",
      label: "摘要已索引",
      missingFields: ["PDF全文"],
    };
  }

  if (!file.chunkCount || file.chunkCount <= 0) {
    return { status: "unindexed", label: "未索引", missingFields: ["chunks"] };
  }

  if (file.bibEdited) {
    return { status: "ready", label: "已校正", missingFields: [] };
  }

  const docType = file.documentType || "paper";
  const missingFields: string[] = [];

  if (docType === "patent") {
    if (!hasNonEmptyBibField(file.bib, "patentNumber")) missingFields.push("专利号");
  } else if (docType === "book") {
    if (!hasNonEmptyBibField(file.bib, "title") && !hasNonEmptyBibField(file.bib, "firstAuthor")) {
      missingFields.push("书名或作者");
    }
  } else {
    if (!hasNonEmptyBibField(file.bib, "title")) missingFields.push("标题");
    if (!hasNonEmptyBibField(file.bib, "firstAuthor") && !hasNonEmptyBibField(file.bib, "authors")) {
      missingFields.push("作者");
    }
  }

  if (missingFields.length > 0) {
    return { status: "partial", label: "书目待补", missingFields };
  }

  return { status: "ready", label: "已索引", missingFields: [] };
}

/** 列表展示用标题：优先 bib.title，否则文件名去 .pdf */
export function getKnowledgeDisplayTitle(file: Pick<KnowledgeFileRecord, "name" | "bib">): string {
  const title = file.bib?.title?.trim();
  if (title) return title;
  return file.name.replace(/\.pdf$/i, "");
}

/** 列表展示用作者行 */
export function getKnowledgeAuthorLine(file: Pick<KnowledgeFileRecord, "bib" | "documentType">): string | null {
  const bib = file.bib;
  if (!bib) return null;

  if (file.documentType === "patent") {
    const inventor = bib.inventors?.[0] || bib.applicant;
    return inventor ? `${inventor}${bib.inventors && bib.inventors.length > 1 ? " 等" : ""}` : null;
  }

  if (bib.firstAuthor) {
    const suffix = bib.authors && bib.authors.length > 1 ? " 等" : "";
    return `${bib.firstAuthor}${suffix}`;
  }

  if (bib.authors && bib.authors.length > 0) {
    return bib.authors.length > 1 ? `${bib.authors[0]} 等` : bib.authors[0];
  }

  return null;
}

/** 列表展示用副标题（年份 · 期刊/出版社） */
export function getKnowledgeSubtitleLine(file: Pick<KnowledgeFileRecord, "bib" | "documentType">): string | null {
  const bib = file.bib;
  if (!bib) return null;

  const parts: string[] = [];
  if (bib.year) parts.push(String(bib.year));
  if (file.documentType === "patent" && bib.patentNumber) {
    parts.push(bib.patentNumber);
  } else if (bib.journal) {
    parts.push(bib.journal);
  } else if (bib.publisher) {
    parts.push(bib.publisher);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

/** 卷(期):页 展示行 */
export function getKnowledgeVolumeIssueLine(bib?: KnowledgeBib | null): string | null {
  if (!bib) return null;
  const parts: string[] = [];
  if (bib.volume) parts.push(bib.volume);
  if (bib.issue) parts.push(`(${bib.issue})`);
  if (bib.pages) {
    parts.push(parts.length > 0 ? `:${bib.pages}` : bib.pages);
  }
  return parts.length > 0 ? parts.join("") : null;
}

/** 规范化 DOI 为可点击 URL */
export function normalizeKnowledgeDoiUrl(doi?: string | null): string | null {
  const raw = doi?.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const id = raw.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  return `https://doi.org/${id}`;
}

/** 期刊指标一行（无数据返回 null） */
export function getKnowledgeMetricsLine(metrics?: JournalMetrics | null): string | null {
  if (!metrics) return null;
  const parts: string[] = [];
  if (metrics.impactFactor != null) {
    parts.push(`IF ${metrics.impactFactor}`);
  }
  if (metrics.jcrQuartile) parts.push(metrics.jcrQuartile);
  if (metrics.casPartition) parts.push(`中科院${metrics.casPartition}`);
  if (metrics.isCoreJournal) parts.push("北大核心");
  if (metrics.citedByCount != null) parts.push(`被引 ${metrics.citedByCount}`);
  if (metrics.oa2yrCitedness != null) parts.push(`2yr ${metrics.oa2yrCitedness.toFixed(1)}`);
  if (metrics.hIndex != null && metrics.impactFactor == null) parts.push(`h${metrics.hIndex}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** 客户端书目筛选（与分页配合：激活筛选时拉全量再过滤） */
export function filterKnowledgeFiles(
  files: KnowledgeFileRecord[],
  filters: KnowledgeListFilters,
): KnowledgeFileRecord[] {
  let result = files;
  const journal = filters.journalContains?.trim().toLowerCase();
  if (journal) {
    result = result.filter((f) => f.bib?.journal?.toLowerCase().includes(journal));
  }
  if (filters.doi === "has") {
    result = result.filter((f) => Boolean(f.bib?.doi?.trim()));
  } else if (filters.doi === "missing") {
    result = result.filter((f) => !f.bib?.doi?.trim());
  }
  if (filters.indexStatus && filters.indexStatus !== "all") {
    result = result.filter(
      (f) => getKnowledgeIndexStatus(f).status === filters.indexStatus,
    );
  }
  return result;
}

export function hasActiveKnowledgeListFilters(filters: KnowledgeListFilters): boolean {
  return Boolean(
    filters.journalContains?.trim()
    || (filters.indexStatus && filters.indexStatus !== "all")
    || (filters.doi && filters.doi !== "all"),
  );
}

/** PATCH 更新书目元数据请求体 */
export interface KnowledgeMetadataPatch {
  name: string;
  bib: KnowledgeBib;
  documentType?: KnowledgeDocumentType | string;
  gbTag?: KnowledgeGbTag | string;
}

export interface KnowledgeSearchParams {
  q?: string;
  category?: string;
  type?: "name" | "semantic";
  page?: number;
  pageSize?: number;
}

export interface KnowledgeSearchResult {
  files: KnowledgeFileRecord[];
  total: number;
  page: number;
  pageSize: number;
  categories: string[];
  searchType: string;
}
