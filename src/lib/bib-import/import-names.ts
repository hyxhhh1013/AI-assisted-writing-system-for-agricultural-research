const INVALID_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

/** 为无 PDF 的书目记录生成唯一占位文件名 */
export function generateBibliographyFileName(title: string, taken: Set<string>): string {
  const cleaned = title.replace(INVALID_CHARS, "").trim().slice(0, 72);
  const base = cleaned || "未命名文献";
  let name = `[书目] ${base}.pdf`;
  let suffix = 2;
  while (taken.has(name)) {
    name = `[书目] ${base} (${suffix}).pdf`;
    suffix += 1;
  }
  taken.add(name);
  return name;
}

/** OA 全文 PDF 文件名（无书目前缀，便于 index-pdfs 识别） */
export function generateOaPdfFileName(title: string, taken: Set<string>): string {
  const cleaned = title.replace(INVALID_CHARS, "").trim().slice(0, 80);
  const base = cleaned || "oa-paper";
  let name = `${base}.pdf`;
  let suffix = 2;
  while (taken.has(name)) {
    name = `${base} (${suffix}).pdf`;
    suffix += 1;
  }
  taken.add(name);
  return name;
}
