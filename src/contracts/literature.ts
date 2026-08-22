/** 外部文献检索契约（ENG-PR-092） */

export const LITERATURE_SOURCES = [
  "openalex",
  "semantic-scholar",
  "crossref",
  "pubmed",
] as const;

export type LiteratureSource = (typeof LITERATURE_SOURCES)[number];

export interface ExternalLiteratureHit {
  /** 去重键：优先 DOI，否则 source+远端 id */
  id: string;
  title: string;
  authors: string[];
  year?: number;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
  abstract?: string;
  citedByCount?: number;
  openAccessUrl?: string;
  isOpenAccess?: boolean;
  /** 主来源（合并后取优先级最高者） */
  source: LiteratureSource;
  /** 合并命中时记录全部来源 */
  sources?: LiteratureSource[];
}

export interface LiteratureSearchRequest {
  query: string;
  limit?: number;
}

export interface LiteratureSearchResponse {
  query: string;
  hits: ExternalLiteratureHit[];
  sourcesQueried: LiteratureSource[];
}

export interface ImportExternalReferenceRequest {
  hit: ExternalLiteratureHit;
  index?: number;
}

export interface ImportExternalReferenceResponse {
  references: import("@/contracts/project").ProjectReferenceRecord[];
  citation: string;
}

/** POST /api/knowledge/ingest-external — 外部文献直接入库 + 尝试 OA 索引 */
export interface IngestExternalKnowledgeRequest {
  hit: ExternalLiteratureHit;
  /** 目标分类；缺省走方向/研究方向推断或「外部摘要」 */
  category?: string;
  directionSlug?: string;
  researchDirection?: string;
  /** 默认 true；false 时跳过 OA PDF 下载 */
  tryOaPdf?: boolean;
}

export interface IngestExternalKnowledgeResponse {
  name: string;
  category: string;
  created: boolean;
  updated: boolean;
  chunkCount: number;
  mode: "pdf" | "abstract" | "bib_only";
  reason?: string;
  pdfBytes?: number;
  /** 给人看的一句结果说明 */
  message: string;
}
