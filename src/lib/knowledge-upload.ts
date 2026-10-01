/** 知识库 PDF 上限。可用 KNOWLEDGE_MAX_UPLOAD_BYTES 覆盖。安全计划默认 100MB。 */
export const KNOWLEDGE_MAX_UPLOAD_BYTES = (() => {
  const raw = Number(process.env.KNOWLEDGE_MAX_UPLOAD_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : 100 * 1024 * 1024;
})();

const PDF_MIME = new Set([
  "",
  "application/pdf",
  "application/x-pdf",
  "application/octet-stream",
]);

export interface KnowledgeUploadRejection {
  status: 400 | 413;
  error: string;
}

/** 扩展名必须是 .pdf；超限 413；MIME 若填写则必须像 PDF。在读入内存之前调用。 */
export function rejectKnowledgeUpload(file: {
  name: string;
  size: number;
  type?: string;
}): KnowledgeUploadRejection | null {
  const name = file.name.trim();
  if (!name.toLowerCase().endsWith(".pdf")) {
    return { status: 400, error: "只接受 PDF 文件" };
  }
  if (file.size > KNOWLEDGE_MAX_UPLOAD_BYTES) {
    return {
      status: 413,
      error: `文件超过 ${Math.round(KNOWLEDGE_MAX_UPLOAD_BYTES / 1024 / 1024)}MB`,
    };
  }
  const mime = (file.type ?? "").split(";")[0].trim().toLowerCase();
  if (!PDF_MIME.has(mime)) {
    return { status: 400, error: "文件类型不是 PDF" };
  }
  return null;
}
