export const MAX_ATTACHMENT_MB = 20;
export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;
/** 提取文本入库上限（超过截断并标记 truncated） */
export const MAX_ATTACHMENT_TEXT_CHARS = 500_000;
/** read_attachment 单次默认/最大返回字符 */
export const READ_ATTACHMENT_DEFAULT_CHARS = 3_000;
export const READ_ATTACHMENT_MAX_CHARS = 8_000;
export const ATTACHMENT_ROOT = "data/attachments";
/** 允许的扩展名（小写，不含点） */
export const ATTACHMENT_ALLOWED_EXTENSIONS = new Set([
  "pdf", "docx", "txt", "md", "tex", "ris", "bib",
  "csv", "xlsx", "xls",
  "png", "jpg", "jpeg", "webp", "gif",
]);
export const ATTACHMENT_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
