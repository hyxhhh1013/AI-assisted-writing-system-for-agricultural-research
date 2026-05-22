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
  sections: Record<string, string>;
  references: string[];
  analysisResults: string[];
  charts?: string;
  expandedOutlineSections?: string[];
  mode?: "review" | "research";
}

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
