/**
 * 按 ISSN 调用 OpenAlex sources API，补期刊级 2yr 被引均值 / h-index（非 JCR IF）
 * 用法：node scripts/enrich-journal-openalex-sources.mjs [--dry-run] [--all]
 */
import { PrismaClient } from "@prisma/client";
import {
  collectIssnKeys,
  formatIssnForOpenAlex,
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchSourceMetrics(issn, mailto) {
  const url = new URL("https://api.openalex.org/sources");
  url.searchParams.set("filter", `issn:${formatIssnForOpenAlex(issn)}`);
  if (mailto) url.searchParams.set("mailto", mailto);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return null;

  const data = await res.json();
  const source = data.results?.[0];
  if (!source?.summary_stats) return null;

  const oa2yr = source.summary_stats["2yr_mean_citedness"];
  const hIndex = source.summary_stats.h_index;
  if (oa2yr == null && hIndex == null) return null;

  return {
    oa2yrCitedness: typeof oa2yr === "number" ? oa2yr : undefined,
    hIndex: typeof hIndex === "number" ? hIndex : undefined,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const all = process.argv.includes("--all");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = all ? Infinity : limitArg ? Number(limitArg.split("=")[1]) : 200;
  const mailto = process.env.OPENALEX_MAILTO?.trim() || "";

  const files = await prisma.knowledgeFile.findMany({
    select: { id: true, name: true, bib: true, metrics: true },
  });

  const issnToFiles = new Map();
  for (const file of files) {
    const bib = parseBib(file.bib);
    for (const issn of collectIssnKeys(bib)) {
      if (!issnToFiles.has(issn)) issnToFiles.set(issn, []);
      issnToFiles.get(issn).push(file);
    }
  }

  const targets = [...issnToFiles.entries()].slice(0, Number.isFinite(limit) ? limit : 200);
  console.log(`OpenAlex 期刊级 enrichment：${targets.length} 个 ISSN${dryRun ? "（dry-run）" : ""}`);

  let updatedFiles = 0;
  for (const [issn, related] of targets) {
    const incoming = await fetchSourceMetrics(issn, mailto);
    await sleep(120);
    if (!incoming) continue;

    for (const file of related) {
      const existing = parseMetricsJson(file.metrics);
      if (existing?.oa2yrCitedness != null) continue;
      const merged = mergeJournalMetrics(existing, incoming);
      if (!dryRun) {
        await prisma.knowledgeFile.update({
          where: { id: file.id },
          data: { metrics: serializeMetrics(merged) },
        });
      }
      updatedFiles++;
      if (updatedFiles <= 5) {
        console.log(
          `  ✓ ${file.name} 2yr=${merged.oa2yrCitedness ?? "—"} h=${merged.hIndex ?? "—"}`,
        );
      }
    }
  }

  console.log(`完成：${dryRun ? "将更新" : "已更新"} ${updatedFiles} 篇`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
