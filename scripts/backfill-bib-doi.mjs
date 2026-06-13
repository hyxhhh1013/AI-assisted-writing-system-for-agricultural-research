/**
 * 将 journal/title 中嵌入的 DOI 写入 bib.doi
 * 用法：node scripts/backfill-bib-doi.mjs [--dry-run]
 */
import { PrismaClient } from "@prisma/client";
import { patchBibWithExtractedDoi } from "./lib/bib-doi-utils.mjs";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

function parseBib(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  const files = await prisma.knowledgeFile.findMany({
    select: { id: true, name: true, bib: true },
  });

  let updated = 0;
  for (const file of files) {
    const bib = parseBib(file.bib);
    const patched = patchBibWithExtractedDoi(bib);
    if (!patched?.doi || patched.doi === bib?.doi) continue;
    updated++;
    if (!dryRun) {
      await prisma.knowledgeFile.update({
        where: { id: file.id },
        data: { bib: JSON.stringify(patched) },
      });
    }
    if (updated <= 5) console.log(`  ✓ ${file.name} → ${patched.doi}`);
  }

  console.log(`${dryRun ? "将更新" : "已更新"} ${updated} 篇 bib.doi`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
