/** 知识库文献元数据契约（前后端 + metadata.json 共享） */

export type KnowledgeDocumentType =
  | "paper"
  | "journal"
  | "patent"
  | "book"
  | "other";

export type KnowledgeGbTag = "J" | "M" | "P" | "D" | "C" | "S";

/** metadata.json 中的结构化书目字段 */
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
  patentNumber?: string;
  inventors?: string[];
  applicant?: string;
  publicationDate?: string;
  isbn?: string;
  publisher?: string;
}

/** metadata.json 单条文献记录 */
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

/** 判断索引与书目元数据是否达标 */
export function getKnowledgeIndexStatus(file: Pick<KnowledgeFileRecord, "chunkCount" | "bib" | "bibEdited" | "documentType" | "parseWarning">): KnowledgeIndexStatusInfo {
  if (file.parseWarning === "no_text" || (file.chunkCount === 0 && file.parseWarning)) {
    return {
      status: "partial",
      label: "无文本层",
      missingFields: ["需 OCR 或换 PDF"],
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
