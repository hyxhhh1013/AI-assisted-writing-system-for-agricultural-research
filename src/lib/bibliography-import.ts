import type {
  BibliographyImportCommitItem,
  BibliographyImportPreviewRow,
  BibliographyImportResult,
} from "@/contracts/bib-import";
import type { KnowledgeBib } from "@/contracts/knowledge";
import { parseBibliographyFile } from "@/lib/bib-import/detect-format";
import { normalizeBibliographyDoi } from "@/lib/bib-import/doi";
import { generateBibliographyFileName } from "@/lib/bib-import/import-names";
import { findPdfMatchForTitle, normalizeTitleKey } from "@/lib/bib-import/match-pdf";
import type { ParsedBibliographyEntry } from "@/lib/bib-import/parse-ris";
import { enrichBibFromCrossref, mergeBibliographyEnrichment } from "@/lib/crossref-bib";
import prisma from "@/lib/prisma";
import { invalidateBibCache } from "@/lib/rag";

type ExistingRow = {
  name: string;
  size: number;
  bibEdited: boolean;
  bib: string | null;
};

function parseStoredBib(raw: string | null): KnowledgeBib | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as KnowledgeBib;
  } catch {
    return null;
  }
}

function findDuplicate(
  bib: KnowledgeBib,
  existing: ExistingRow[],
): ExistingRow | null {
  const doi = normalizeBibliographyDoi(bib.doi);
  if (doi) {
    for (const row of existing) {
      const stored = parseStoredBib(row.bib);
      if (normalizeBibliographyDoi(stored?.doi) === doi) return row;
    }
  }
  const titleKey = normalizeTitleKey(bib.title || "");
  if (titleKey) {
    for (const row of existing) {
      const stored = parseStoredBib(row.bib);
      const storedKey = normalizeTitleKey(stored?.title || row.name.replace(/\.pdf$/i, ""));
      if (storedKey && storedKey === titleKey) return row;
    }
  }
  return null;
}

function buildPreviewRow(
  entry: ParsedBibliographyEntry,
  index: number,
  existing: ExistingRow[],
  takenNames: Set<string>,
): BibliographyImportPreviewRow {
  const tempId = `row-${index}`;
  const pdfCandidates = existing.map((row) => ({
    name: row.name,
    size: row.size,
    bib: parseStoredBib(row.bib),
  }));
  const pdfMatchName = findPdfMatchForTitle(entry.bib.title || "", pdfCandidates);
  const duplicate = findDuplicate(entry.bib, existing);

  let action: BibliographyImportPreviewRow["action"] = "create";
  let skipReason: string | undefined;
  let duplicateName: string | undefined;

  if (duplicate) {
    duplicateName = duplicate.name;
    if (duplicate.bibEdited) {
      action = "skip";
      skipReason = "该书目已人工校正，跳过";
    } else if (pdfMatchName || duplicate.size > 0) {
      action = "merge";
    } else if (duplicate.size === 0) {
      action = "skip";
      skipReason = "同名书目占位已存在";
    }
  }

  const suggestedName =
    action === "merge" && (pdfMatchName || duplicateName)
      ? (pdfMatchName || duplicateName)!
      : generateBibliographyFileName(entry.bib.title || "未命名文献", takenNames);

  return {
    tempId,
    bib: entry.bib,
    documentType: entry.documentType,
    suggestedName,
    pdfMatchName,
    action,
    skipReason,
    duplicateName,
  };
}

export async function previewBibliographyImport(
  filename: string,
  content: string,
  category: string,
): Promise<{ format: ReturnType<typeof parseBibliographyFile>["format"]; rows: BibliographyImportPreviewRow[]; totalParsed: number }> {
  const { format, entries } = parseBibliographyFile(filename, content);
  const existing = await prisma.knowledgeFile.findMany({
    select: { name: true, size: true, bibEdited: true, bib: true },
  });
  const takenNames = new Set(existing.map((row) => row.name));

  const rows = entries.map((entry, index) =>
    buildPreviewRow(entry, index, existing, takenNames),
  );

  return { format, rows, totalParsed: entries.length };
}

async function mergeIntoExisting(
  targetName: string,
  incoming: KnowledgeBib,
  documentType?: string,
): Promise<"updated" | "skipped"> {
  const row = await prisma.knowledgeFile.findUnique({ where: { name: targetName } });
  if (!row) return "skipped";
  if (row.bibEdited) return "skipped";

  const current = parseStoredBib(row.bib) ?? {};
  const merged = mergeBibliographyEnrichment(current, incoming);

  await prisma.knowledgeFile.update({
    where: { name: targetName },
    data: {
      bib: JSON.stringify(merged),
      ...(documentType ? { documentType } : {}),
    },
  });
  return "updated";
}

async function createBibliographyRecord(
  name: string,
  category: string,
  bib: KnowledgeBib,
  documentType: string,
): Promise<void> {
  await prisma.knowledgeFile.create({
    data: {
      name,
      category,
      documentType,
      size: 0,
      chunkCount: 0,
      bib: JSON.stringify(bib),
      bibEdited: false,
      mtime: new Date(),
    },
  });
}

export async function commitBibliographyImport(
  items: BibliographyImportCommitItem[],
  category: string,
): Promise<BibliographyImportResult> {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let enriched = 0;

  const taken = new Set(
    (await prisma.knowledgeFile.findMany({ select: { name: true } })).map((r) => r.name),
  );

  for (const item of items) {
    if (item.action === "skip") {
      skipped += 1;
      continue;
    }

    let bib = item.bib;
    if (bib.doi) {
      const before = JSON.stringify(bib);
      bib = await enrichBibFromCrossref(bib);
      if (JSON.stringify(bib) !== before) enriched += 1;
    }

    if (item.action === "merge") {
      const target = item.targetName || item.suggestedName;
      if (!target) {
        skipped += 1;
        continue;
      }
      const result = await mergeIntoExisting(target, bib, item.documentType);
      if (result === "updated") updated += 1;
      else skipped += 1;
      continue;
    }

    let name = item.suggestedName;
    if (!name) {
      name = generateBibliographyFileName(bib.title || "未命名文献", taken);
    } else if (taken.has(name)) {
      name = generateBibliographyFileName(bib.title || "未命名文献", taken);
    } else {
      taken.add(name);
    }

    await createBibliographyRecord(name, category, bib, item.documentType || "paper");
    created += 1;
  }

  invalidateBibCache();
  return { created, updated, skipped, enriched };
}
