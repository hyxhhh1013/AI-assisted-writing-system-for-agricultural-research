/** ENG-PR-096a：扩写前 RAG 检索预览 + 用户勾选文献 */

export interface RetrievePreviewBib {
  title?: string;
  firstAuthor?: string;
  year?: number;
  journal?: string;
  doi?: string;
}

export interface RetrievePreviewHit {
  /** 与 refMapping / selectedSourceIds 一致的 source key（常为 PDF 文件名） */
  sourceKey: string;
  displayName: string;
  /** 已在项目 references 中的编号；新文献为 null */
  refIndex: number | null;
  isNew: boolean;
  snippet: string;
  chunkCount: number;
  category: string;
  bib?: RetrievePreviewBib;
}

export interface RetrievePreviewRequest {
  title: string;
  section: string;
  context?: string;
  bullets?: string[];
  language?: "zh" | "en";
  existingReferences?: string[];
  researchDirection?: string;
  retrievalMode?: "precise" | "balanced" | "extensive";
  projectMode?: "review" | "research";
}

export interface RetrievePreviewResponse {
  hits: RetrievePreviewHit[];
  /** 默认全选（含已在项目中的命中来源） */
  defaultSelectedSourceIds: string[];
  query: string;
  hitCount: number;
}
