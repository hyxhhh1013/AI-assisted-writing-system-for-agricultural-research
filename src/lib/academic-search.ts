// 公开学术搜索引擎 API 封装（查重等旧路径）
// 实现已统一到 literature-search.ts（ENG-PR-092）

import { searchExternalLiterature } from "@/lib/literature-search";

export interface AcademicSearchResult {
  title: string;
  authors: string[];
  year?: number;
  url: string;
  abstract?: string;
  snippet: string;
  score: number;
  source: "semantic-scholar" | "crossref" | "openalex" | "pubmed";
}

/** 对文本片段进行联网学术搜索 */
export async function searchAcademic(text: string, limit = 5): Promise<AcademicSearchResult[]> {
  const query = text.replace(/[\s\n\r]+/g, " ").slice(0, 150);
  const hits = await searchExternalLiterature(query, { limit });

  return hits.map((hit, index) => ({
    title: hit.title,
    authors: hit.authors,
    year: hit.year,
    url: hit.url ?? (hit.doi ? `https://doi.org/${hit.doi}` : ""),
    abstract: hit.abstract,
    snippet: hit.abstract ?? hit.title,
    score: 1 - index * 0.05,
    source: hit.source === "semantic-scholar" || hit.source === "crossref"
      ? hit.source
      : hit.source === "openalex"
        ? "openalex"
        : "pubmed",
  }));
}
