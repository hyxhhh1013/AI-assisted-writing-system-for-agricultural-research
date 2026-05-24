export interface ProjectDTO {
  id: string;
  title: string;
  userId?: string;
  authors: string;
  affiliations: string;
  abstract: string;
  keywords: string;
  classification: string;
  researchDirection: string;
  outline: string;
  template: string;
  lastUpdated: number;
  createdAt?: number;
  sections: Record<string, string>;
  references: string[];
  analysisResults: string[];
  charts?: string;
  expandedOutlineSections?: string[];
  mode?: "review" | "research";
  /** JSON string: EvidenceClaim[] */
  dataClaims?: string;
  /** JSON string: DataSourceAnalysis[] */
  dataSources?: string;
}

/** Alias kept for backward compat — prefer ProjectDTO in new code */
export type ProjectData = ProjectDTO;

export interface ProjectMetaPatch {
  title?: string;
  authors?: string;
  affiliations?: string;
  abstract?: string;
  keywords?: string;
  classification?: string;
  researchDirection?: string;
  outline?: string;
  template?: string;
}

export interface SectionPatch {
  content: string;
  clientUpdatedAt: number;  // 乐观锁
}

export interface ReferencesPatch {
  references: string[];
  clientUpdatedAt: number;
}
