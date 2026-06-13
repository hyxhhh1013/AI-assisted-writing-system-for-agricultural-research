import type { KnowledgeBib, KnowledgeDocumentType } from "@/contracts/knowledge";
import { normalizeBibliographyDoi } from "@/lib/bib-import/doi";

export interface ParsedBibliographyEntry {
  bib: KnowledgeBib;
  documentType: KnowledgeDocumentType;
  sourceFormat: "ris" | "bibtex";
}

const RIS_TYPE_MAP: Record<string, KnowledgeDocumentType> = {
  JOUR: "journal",
  CONF: "paper",
  BOOK: "book",
  CHAP: "book",
  PAT: "patent",
  THES: "paper",
  RPRT: "other",
  GEN: "other",
};

function parseRisYear(raw?: string): number | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  const year = Number.parseInt(digits, 10);
  return Number.isFinite(year) && year >= 1000 && year <= 9999 ? year : undefined;
}

function parseRisTags(block: string): Record<string, string[]> {
  const tags: Record<string, string[]> = {};
  let currentTag = "";
  for (const line of block.split("\n")) {
    const match = line.match(/^([A-Z0-9]{2,3})\s*-\s*(.*)$/);
    if (match) {
      currentTag = match[1].toUpperCase();
      const value = match[2].trim();
      if (!tags[currentTag]) tags[currentTag] = [];
      if (value) tags[currentTag].push(value);
      continue;
    }
    if (currentTag && /^\s{2,}/.test(line)) {
      const cont = line.trim();
      const bucket = tags[currentTag];
      if (bucket?.length) {
        bucket[bucket.length - 1] = `${bucket[bucket.length - 1]} ${cont}`.trim();
      }
    }
  }
  return tags;
}

function parseRisRecord(block: string): ParsedBibliographyEntry | null {
  const tags = parseRisTags(block);
  const ty = tags.TY?.[0]?.toUpperCase() || "GEN";
  const documentType = RIS_TYPE_MAP[ty] ?? "paper";
  const authors = [...(tags.AU ?? []), ...(tags.A1 ?? []), ...(tags.A2 ?? [])].map((a) => a.trim()).filter(Boolean);
  const title = (tags.TI?.[0] || tags.T1?.[0] || tags.CT?.[0] || "").trim();
  const doi = normalizeBibliographyDoi(tags.DO?.[0] || tags.L3?.[0]);
  const sp = tags.SP?.[0];
  const ep = tags.EP?.[0];
  const pages = sp && ep ? `${sp}-${ep}` : sp || ep;

  const bib: KnowledgeBib = {
    title: title || undefined,
    authors: authors.length > 0 ? authors : undefined,
    firstAuthor: authors[0],
    year: parseRisYear(tags.PY?.[0] || tags.Y1?.[0]),
    journal: (tags.JO?.[0] || tags.JF?.[0] || tags.T2?.[0] || "").trim() || undefined,
    volume: tags.VL?.[0]?.trim() || undefined,
    issue: tags.IS?.[0]?.trim() || undefined,
    pages: pages?.trim() || undefined,
    doi,
    issn: tags.SN?.[0]?.trim() || undefined,
    isbn: tags.PB?.[0]?.trim() || undefined,
    publisher: tags.PB?.[0]?.trim() || undefined,
  };

  if (!bib.title && !bib.doi) return null;

  return { bib, documentType, sourceFormat: "ris" };
}

export function splitRisRecords(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized
    .split(/\nER\s*-\s*\n/i)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0 && /^TY\s*-/im.test(chunk));
}

/** 解析 EndNote / Zotero 导出的 RIS 文本 */
export function parseRis(content: string): ParsedBibliographyEntry[] {
  return splitRisRecords(content)
    .map(parseRisRecord)
    .filter((entry): entry is ParsedBibliographyEntry => entry != null);
}
