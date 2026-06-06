/**
 * 按 DOI 调用 OpenAlex，补 citedByCount / OA 链接 / ISSN
 * 用法：node scripts/enrich-knowledge-openalex.mjs [--dry-run] [--limit=50]
 */
import { PrismaClient } from "@prisma/client";
import {
  mergeJournalMetrics,
  parseMetricsJson,
  serializeMetrics,
} from "./lib/journal-metrics-utils.mjs";

const prisma = new PrismaClient();

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 50;
  const mailto = process.env.OPENALEX_MAILTO?.trim() || "";

  const files = await prisma.knowledgeFile.findMany({
    select: { id: true, name: true, bib: true, metrics: true },
  });

  const targets = files
    .map((f) => ({ ...f, bibObj: parseBib(f.bib) }))
    .filter((f) => f.bibObj?.doi?.trim())
    .slice(0, Number.isFinite(limit) ? limit : 50);

  console.log(`OpenAlex enrichment：${targets.length} 篇${dryRun ? "（dry-run）" : ""}`);

  let updated = 0;
  for (const file of targets) {
    const doi = file.bibObj.doi.trim();
    const result = await fetchOpenAlex(doi, mailto);
    await sleep(120);
    if (!result) continue;

    const mergedMetrics = mergeJournalMetrics(parseMetricsJson(file.metrics), result.metrics);
    const bibPatch = { ...file.bibObj };
    if (result.issn && !bibPatch.issn) bibPatch.issn = result.issn;

    if (!dryRun) {
      await prisma.knowledgeFile.update({
        where: { id: file.id },
        data: {
          metrics: serializeMetrics(mergedMetrics),
          bib: JSON.stringify(bibPatch),
        },
      });
    }
    updated++;
    if (updated <= 5) {
      console.log(`  ✓ ${file.name} cited=${mergedMetrics.citedByCount ?? "—"}`);
    }
  }

  console.log(`完成：${dryRun ? "将更新" : "已更新"} ${updated} 篇`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
