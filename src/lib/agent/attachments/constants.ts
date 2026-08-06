export const MAX_ATTACHMENT_MB = 20;
export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;
/** 视觉模型（GLM-4V）单张图片大小上限：超过直接失败，避免大图转 base64 打爆超时 */
export const MAX_VISION_IMAGE_BYTES = 8 * 1024 * 1024;
/** PDF 图表理解：渲染前 N 页用视觉模型逐页理解（论文图表多在开头几页，控制成本） */
export const MAX_PDF_VISION_PAGES = 5;
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
