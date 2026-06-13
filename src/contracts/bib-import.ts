/** RIS / BibTeX 书目批量导入契约 */

import type { KnowledgeBib, KnowledgeDocumentType } from "@/contracts/knowledge";

export type BibliographyImportFormat = "ris" | "bibtex";

export type BibliographyImportAction = "create" | "merge" | "skip";

export interface BibliographyImportPreviewRow {
  tempId: string;
  bib: KnowledgeBib;
  documentType: KnowledgeDocumentType;
  suggestedName: string;
  /** 按标题模糊匹配到的已有 PDF 文件名 */
  pdfMatchName: string | null;
  /** 默认导入动作 */
  action: BibliographyImportAction;
  skipReason?: string;
  duplicateName?: string;
}

export interface BibliographyImportPreviewResponse {
  format: BibliographyImportFormat;
  category: string;
  rows: BibliographyImportPreviewRow[];
  totalParsed: number;
}

export interface BibliographyImportCommitItem {
  tempId: string;
  action: BibliographyImportAction;
  bib: KnowledgeBib;
  documentType?: KnowledgeDocumentType;
  suggestedName?: string;
  /** merge 时写入的目标 KnowledgeFile.name */
  targetName?: string;
}

export interface BibliographyImportResult {
  created: number;
  updated: number;
  skipped: number;
  enriched: number;
}
