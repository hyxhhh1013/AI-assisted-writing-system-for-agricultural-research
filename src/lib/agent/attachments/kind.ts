/** 附件种类：由扩展名推断，不改 Prisma。仪器扩展名先识别，白名单仍等 DATA-03。 */

export type AttachmentKind = "tabular" | "instrument" | "document" | "image";

const TABULAR_EXTS = new Set(["csv", "tsv", "xlsx", "xls", "dpt"]);
const INSTRUMENT_EXTS = new Set(["xy", "xyd", "ras", "raw", "uxd", "dif"]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "tif", "tiff"]);

export function extOfFileName(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : "";
}

export function inferAttachmentKind(fileName: string): AttachmentKind {
  const ext = extOfFileName(fileName);
  if (TABULAR_EXTS.has(ext)) return "tabular";
  if (INSTRUMENT_EXTS.has(ext)) return "instrument";
  if (IMAGE_EXTS.has(ext)) return "image";
  return "document";
}

/** 单页成图 PDF 在提取后标成 image，多页 PDF 仍是 document。 */
export function resolveAttachmentKind(
  fileName: string,
  extractSource?: string | null,
): AttachmentKind {
  if (extractSource === "pdf_figure") return "image";
  return inferAttachmentKind(fileName);
}

export type AttachmentIngestStatus = "ingested" | "failed" | "pending" | "skipped";

export interface AttachmentIngestView {
  status: AttachmentIngestStatus;
  claimCount?: number;
  error?: string;
}

/** 芯片右侧短标签：非表格不显示额外状态 */
export function formatAttachmentChipBadge(input: {
  kind: AttachmentKind;
  extractStatus: "uploading" | "extracting" | "ready" | "failed";
  ingest?: AttachmentIngestView | null;
}): string | null {
  if (input.kind === "image" && input.extractStatus === "ready") return "待登记";
  if (input.kind !== "tabular") return null;
  if (input.extractStatus === "uploading" || input.extractStatus === "extracting") {
    return null;
  }
  if (input.extractStatus === "failed") return "分析失败";
  const ingest = input.ingest;
  if (!ingest || ingest.status === "pending") return "待确认";
  if (ingest.status === "failed") return "分析失败";
  if (ingest.status === "ingested") {
    const n = ingest.claimCount ?? 0;
    return `已入库 · ${n} 条声明`;
  }
  return null;
}
