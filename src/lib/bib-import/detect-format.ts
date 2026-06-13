import type { BibliographyImportFormat } from "@/contracts/bib-import";
import { parseBibtex } from "@/lib/bib-import/parse-bibtex";
import { parseRis } from "@/lib/bib-import/parse-ris";
import type { ParsedBibliographyEntry } from "@/lib/bib-import/parse-ris";

export function detectBibliographyFormat(filename: string, content: string): BibliographyImportFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".bib") || lower.endsWith(".bibtex")) return "bibtex";
  if (lower.endsWith(".ris")) return "ris";
  if (/^\s*@\s*(article|book|inproceedings|misc)\s*\{/im.test(content)) return "bibtex";
  return "ris";
}

export function parseBibliographyFile(filename: string, content: string): {
  format: BibliographyImportFormat;
  entries: ParsedBibliographyEntry[];
} {
  const format = detectBibliographyFormat(filename, content);
  const entries = format === "bibtex" ? parseBibtex(content) : parseRis(content);
  return { format, entries };
}
