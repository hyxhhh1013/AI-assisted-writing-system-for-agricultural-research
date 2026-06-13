/**
 * 从实验室 CSV/Excel 导入期刊 IF/分区到 Prisma KnowledgeFile.metrics
 * 用法：node scripts/import-journal-metrics.mjs [path] [--dry-run]
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import {
  lookupMetricsForBib,
  mergeJournalMetrics,
  parseJournalMetricsFile,
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

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const fileArg = args.find((a) => !a.startsWith("--"));
  const defaultPath = process.env.JOURNAL_METRICS_CSV_PATH
    ? path.resolve(process.env.JOURNAL_METRICS_CSV_PATH)
    : path.join(process.cwd(), "data/journal-metrics.csv");

  const filePath = fileArg ? path.resolve(fileArg) : defaultPath;
  if (!fs.existsSync(filePath)) {
    console.error(`未找到文件：${filePath}`);
    console.error("支持 .csv / .xlsx；或设置 JOURNAL_METRICS_CSV_PATH");
    process.exit(1);
  }

  const lookup = await parseJournalMetricsFile(filePath);
  console.log(
    `表内 ISSN ${lookup.byIssn.size} 条，刊名 ${lookup.byJournal.size} 条${dryRun ? "（dry-run）" : ""}`,
  );

  const files = await prisma.knowledgeFile.findMany({
    select: { id: true, name: true, bib: true, metrics: true },
  });

  let matched = 0;
  let updated = 0;

  for (const file of files) {
    const bib = parseBib(file.bib);
    const incoming = lookupMetricsForBib(bib, lookup);
    if (!incoming) continue;
    matched++;
    const merged = mergeJournalMetrics(parseMetricsJson(file.metrics), incoming);
    if (!dryRun) {
      await prisma.knowledgeFile.update({
        where: { id: file.id },
        data: { metrics: serializeMetrics(merged) },
      });
    }
    updated++;
    if (updated <= 5) {
      console.log(`  ✓ ${file.name} → IF ${merged.impactFactor ?? "—"} ${merged.jcrQuartile ?? ""}`);
    }
  }

  const rate = files.length > 0 ? Math.round((matched / files.length) * 100) : 0;
  console.log(
    `完成：${files.length} 篇文献，匹配 ${matched} 篇（${rate}%），${dryRun ? "将更新" : "已更新"} ${updated} 篇`,
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
