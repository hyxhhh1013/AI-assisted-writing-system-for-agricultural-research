export interface ParsedLabPdfName {
  year: string;
  author: string;
  title: string;
}

const YEAR_TOKEN = /^(19|20)\d{2}$/;
const CN_AUTHOR_TOKEN = /^[一-鿿]{2,5}$/;
const EN_AUTHOR_TOKEN = /^[A-Za-z][A-Za-z.'-]{1,23}$/;

/** 实验室入库 PDF：`8-2021-罗伟-题名.pdf` 或已被洗成空格的同款字符串 */
export function parseLabPdfFilename(filename: string): ParsedLabPdfName | null {
  const cleaned = filename
    .replace(/^\[\d+\]\s*/, "")
    .replace(/\.pdf$/i, "")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;

  const m = cleaned.match(
    /^(?:\d{1,4}\s+)?((?:19|20)\d{2})\s+([一-鿿]{2,5}|[A-Za-z][A-Za-z.'-]{1,23})\s+(.+)$/,
  );
  if (m?.[1] && m[2] && m[3] && m[3].trim().length >= 4) {
    return { year: m[1], author: m[2], title: m[3].trim() };
  }

  const parts = filename.replace(/\.pdf$/i, "").split(/[_\-]/).map((p) => p.trim()).filter(Boolean);
  let year = "";
  let author = "";
  const titleParts: string[] = [];
  let afterYear = false;
  for (const p of parts) {
    if (!year && YEAR_TOKEN.test(p)) {
      year = p;
      afterYear = true;
      continue;
    }
    if (afterYear && !author && (CN_AUTHOR_TOKEN.test(p) || EN_AUTHOR_TOKEN.test(p))) {
      author = p;
      continue;
    }
    if (afterYear && author) titleParts.push(p);
  }
  const title = titleParts.join(" ").replace(/\s+/g, " ").trim()
    || (author
      ? cleaned.replace(year, " ").replace(author, " ").replace(/^\s*\d+\s*/, "").replace(/\s+/g, " ").trim()
      : "");
  if (year && author && title.length >= 4) return { year, author, title };
  return null;
}
