/**
 * Agent 附件（W3-FILE-UPLOAD）— 前后端共享类型
 * 与 prisma/schema.prisma `AgentAttachment` 对齐（不含 extractedText 全文）
 */

export type AttachmentExtractSource =
  | "pdf" | "docx" | "csv" | "excel" | "text" | "spectrum"
  | "image_vision" | "image_ocr" | "pdf_vision" | "failed";

export type AttachmentStatus =
  | "extracting" | "ready" | "extract_failed" | "unsupported";

export type AttachmentKind = "tabular" | "instrument" | "document" | "image";

export type AttachmentIngestStatus = "ingested" | "failed" | "pending" | "skipped";

/** 前后端共享的附件摘要（不含 extractedText 全文） */
export interface AgentAttachmentInfo {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  status: AttachmentStatus;
  extractSource?: AttachmentExtractSource | null;
  kind?: AttachmentKind;
  ingest?: {
    status: AttachmentIngestStatus;
    claimCount?: number;
    error?: string;
  } | null;
  charCount?: number;
  truncated?: boolean;
  pinned: boolean;
  createdAt: string;
}
