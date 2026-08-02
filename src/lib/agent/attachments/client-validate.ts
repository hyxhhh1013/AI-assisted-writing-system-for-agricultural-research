/** 前端过滤：与后端白名单/上限保持一致（20MB）。返回拒绝原因，null = 允许。 */
export function clientRejectReason(file: { name: string; size: number }): string | null {
  if (file.size > 20 * 1024 * 1024) return "文件超过 20MB";
  const allowed = new Set(["pdf","docx","txt","md","tex","ris","bib","csv","xlsx","xls","png","jpg","jpeg","webp","gif"]);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowed.has(ext)) return "不支持的文件类型";
  return null;
}
