import {
  ATTACHMENT_ALLOWED_EXTENSIONS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_MB,
} from "@/lib/agent/attachments/constants";

/** 前端过滤：与后端白名单/上限保持一致。返回拒绝原因，null = 允许。 */
export function clientRejectReason(file: { name: string; size: number }): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) return `文件超过 ${MAX_ATTACHMENT_MB}MB`;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ATTACHMENT_ALLOWED_EXTENSIONS.has(ext)) return "不支持的文件类型";
  return null;
}
