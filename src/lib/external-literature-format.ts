/** 外部文献 GB/T 格式化 — 纯函数，可供 Client Component 安全导入 */

function cleanDoi(raw: string): string {
  if (!raw) return raw;
  const match = raw.match(/(10\.\d{4,}\/[^\s一-鿿"<>，。、；]+)/);
  return match ? match[1].replace(/[.,;]+$/, "") : raw.trim();
}

/** 外部文献命中 → GB/T 7714 参考文献行（ENG-PR-092） */
export function formatExternalLiteratureHit(hit: {
  title: string;
  authors: string[];
  year?: number;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
}): string {
  const firstAuthor = hit.authors[0]?.trim() || "佚名";
  const author = firstAuthor + (hit.authors.length > 1 ? " 等" : "");
  const title = hit.title.trim();
  const journal = hit.journal?.trim() ?? "";
  const year = hit.year;
  const vol = hit.volume?.trim() ?? "";
  const issue = hit.issue?.trim() ?? "";
  const pages = hit.pages?.trim() ?? "";
  const doi = hit.doi ? cleanDoi(hit.doi) : "";

  let result = `${author}. `;
  result += title ? `${title}[J]. ` : "[J]. ";
  if (journal) result += journal;
  if (year) result += `, ${year}`;
  if (vol) result += `, ${vol}`;
  if (issue) result += `(${issue})`;
  if (pages) result += `: ${pages}`;
  result += ".";
  if (doi) result += ` DOI: ${doi}.`;
  return result.trim();
}
