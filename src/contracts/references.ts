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
