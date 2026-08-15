/** 引用-文献映射（Prisma ReferenceSource） */
export interface ReferenceSourceRecord {
  id: string;
  projectId: string;
  refIndex: number;
  sourceName: string;
  category: string;
  citation: string;
  createdAt: string;
}

/** GET /api/references?format=true 响应 */
export interface FormattedRefsResponse {
  formatted: Record<string, string>;
}

export interface ReferenceMappingInput {
  refIndex: number;
  sourceName: string;
  category?: string;
  citation?: string;
}

export interface BatchUpsertReferencesRequest {
  projectId: string;
  mappings: ReferenceMappingInput[];
}

export interface UpsertReferenceRequest {
  projectId: string;
  refIndex: number;
  sourceName: string;
  category?: string;
  citation?: string;
}

/** 引用「原文三态」详情（GET /api/projects/:id/references/source） */
export interface ReferenceSourceDetail {
  refIndex: number;
  /** 引用文本（书目） */
  citation: string;
  title: string | null;
  abstract: string | null;
  doi: string | null;
  openAccessUrl: string | null;
  /** ReferenceSource.sourceName（知识库文件名或题录兜底标识） */
  sourceName: string | null;
  /** full=知识库全文；abstract=外部导入摘要；bib_only=仅书目 */
  mode: "full" | "abstract" | "bib_only";
  /** mode=full 时的原文片段（按段落截断） */
  fullTextChunks: { content: string }[] | null;
}
