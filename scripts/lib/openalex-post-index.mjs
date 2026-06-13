/**
 * 索引完成后按文献名批量 OpenAlex enrichment（限流，供 index-pdfs 调用）
 */
import { PrismaClient } from "@prisma/client";
import { extractDoiFromBib } from "./bib-doi-utils.mjs";
import {
  mergeJournalMetrics,
  parseMetricsJson,
  serializeMetrics,
} from "./journal-metrics-utils.mjs";

function parseBib(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function pickIssn(source) {
  if (!source) return undefined;
  const raw = source.issn_l ?? source.issn;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].trim();
  return undefined;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchOpenAlex(doi, mailto) {
  const id = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim();
  if (!id) return null;
  const url = new URL(`https://api.openalex.org/works/doi:${encodeURIComponent(id)}`);
  if (mailto) url.searchParams.set("mailto", mailto);
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return null;
  const work = await res.json();
  const metrics = {};
  if (typeof work.cited_by_count === "number") metrics.citedByCount = work.cited_by_count;
  const oaUrl = work.open_access?.oa_url;
  if (typeof oaUrl === "string" && oaUrl.trim()) metrics.openAccessUrl = oaUrl.trim();
  const issn = pickIssn(work.primary_location?.source);
  return { metrics, issn };
}

/** @param {string[]} names 本次索引涉及的文件名 */
export async function enrichKnowledgeFilesByNames(names, options = {}) {
  const prisma = new PrismaClient();
  const mailto = options.mailto?.trim() || process.env.OPENALEX_MAILTO?.trim() || "";
  const limit = options.limit ?? 20;
  const nameSet = new Set(names);

  const rows = await prisma.knowledgeFile.findMany({
    where: { name: { in: [...nameSet] } },
    select: { id: true, name: true, bib: true, metrics: true },
  });

  const targets = rows
    .map((f) => ({ ...f, bibObj: parseBib(f.bib) }))
    .filter((f) => extractDoiFromBib(f.bibObj))
    .slice(0, limit);

  let updated = 0;
  for (const file of targets) {
    const doi = extractDoiFromBib(file.bibObj);
    if (!doi) continue;
    const result = await fetchOpenAlex(doi, mailto);
    await sleep(120);
    if (!result) continue;

    const mergedMetrics = mergeJournalMetrics(parseMetricsJson(file.metrics), result.metrics);
    const bibPatch = { ...file.bibObj };
    if (result.issn && !bibPatch.issn) bibPatch.issn = result.issn;

    await prisma.knowledgeFile.update({
      where: { id: file.id },
      data: {
        metrics: serializeMetrics(mergedMetrics),
        bib: JSON.stringify(bibPatch),
      },
    });
    updated++;
  }

  await prisma.$disconnect();
  return updated;
}
