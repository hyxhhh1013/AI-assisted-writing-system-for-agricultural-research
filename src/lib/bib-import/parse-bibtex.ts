import type { KnowledgeBib, KnowledgeDocumentType } from "@/contracts/knowledge";
import { normalizeBibliographyDoi } from "@/lib/bib-import/doi";
import type { ParsedBibliographyEntry } from "@/lib/bib-import/parse-ris";

const BIBTEX_TYPE_MAP: Record<string, KnowledgeDocumentType> = {
  article: "journal",
  inproceedings: "paper",
  conference: "paper",
  book: "book",
  incollection: "book",
  phdthesis: "paper",
  mastersthesis: "paper",
  patent: "patent",
  misc: "other",
};

function stripBibtexBraces(value: string): string {
  let v = value.trim();
  if (v.startsWith("{") && v.endsWith("}")) {
    v = v.slice(1, -1).trim();
  }
  return v.replace(/\s+/g, " ");
}

function parseBibtexFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let i = 0;
  while (i < body.length) {
    const keyMatch = body.slice(i).match(/^\s*([a-zA-Z][\w-]*)\s*=\s*/);
    if (!keyMatch) break;
    const key = keyMatch[1].toLowerCase();
    i += keyMatch[0].length;

    let value = "";
    const ch = body[i];
    if (ch === "{") {
      let depth = 0;
      const start = i;
      for (; i < body.length; i++) {
        if (body[i] === "{") depth += 1;
        if (body[i] === "}") {
          depth -= 1;
          if (depth === 0) {
            value = body.slice(start + 1, i);
            i += 1;
            break;
          }
        }
      }
    } else if (ch === '"') {
      i += 1;
      const start = i;
      while (i < body.length && body[i] !== '"') i += 1;
      value = body.slice(start, i);
      i += 1;
    } else {
      const start = i;
      while (i < body.length && body[i] !== "," && body[i] !== "\n") i += 1;
      value = body.slice(start, i).trim();
    }

    fields[key] = stripBibtexBraces(value);
    while (i < body.length && (body[i] === "," || body[i] === "\n" || body[i] === "\r")) i += 1;
  }
  return fields;
}

export function splitBibtexEntries(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parts: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i] === "@" && depth === 0) start = i;
    if (normalized[i] === "{") depth += 1;
    if (normalized[i] === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        parts.push(normalized.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return parts;
}

function parseAuthors(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const authors = raw
    .split(/\s+and\s+/i)
    .map((a) => a.trim())
    .filter(Boolean);
  return authors.length > 0 ? authors : undefined;
}

function parseBibtexEntry(block: string): ParsedBibliographyEntry | null {
  const header = block.match(/^@\s*([a-zA-Z]+)\s*\{\s*([^,]*),/);
  if (!header) return null;
  const entryType = header[1].toLowerCase();
  const bodyStart = block.indexOf(",") + 1;
  const bodyEnd = block.lastIndexOf("}");
  const fields = parseBibtexFields(block.slice(bodyStart, bodyEnd));

  const authors = parseAuthors(fields.author);
  const title = fields.title?.trim();
  const doi = normalizeBibliographyDoi(fields.doi);
  const yearRaw = fields.year?.replace(/\D/g, "").slice(0, 4);
  const year = yearRaw ? Number.parseInt(yearRaw, 10) : undefined;

  const bib: KnowledgeBib = {
    title: title || undefined,
    authors,
    firstAuthor: authors?.[0],
    year: Number.isFinite(year) && year! >= 1000 ? year : undefined,
    journal: fields.journal?.trim() || fields.booktitle?.trim() || undefined,
    volume: fields.volume?.trim() || undefined,
    issue: fields.number?.trim() || undefined,
    pages: fields.pages?.trim() || undefined,
    doi,
    issn: fields.issn?.trim() || undefined,
    isbn: fields.isbn?.trim() || undefined,
    publisher: fields.publisher?.trim() || undefined,
  };

  if (!bib.title && !bib.doi) return null;

  return {
    bib,
    documentType: BIBTEX_TYPE_MAP[entryType] ?? "paper",
    sourceFormat: "bibtex",
  };
}

/** 解析 BibTeX 导出文本 */
export function parseBibtex(content: string): ParsedBibliographyEntry[] {
  return splitBibtexEntries(content)
    .map(parseBibtexEntry)
    .filter((entry): entry is ParsedBibliographyEntry => entry != null);
}
