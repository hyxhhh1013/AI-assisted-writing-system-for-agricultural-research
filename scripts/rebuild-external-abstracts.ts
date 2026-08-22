/**
 * 补建已入库外部摘要的 RAG 索引，并自动归类到实验室分类。
 *
 * Usage:
 *   npx --yes tsx scripts/rebuild-external-abstracts.ts
 *   npx --yes tsx scripts/rebuild-external-abstracts.ts --dry-run
 *   npx --yes tsx scripts/rebuild-external-abstracts.ts --all
 *
 * --all：即使已有 chunk 也重算 preferredCategory / Prisma.category
 */

import { rebuildExternalAbstractIndexes } from "../src/lib/external-knowledge-ingest";

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const onlyMissingChunks = !args.has("--all");

  const result = await rebuildExternalAbstractIndexes({
    dryRun,
    onlyMissingChunks,
  });

  console.log(
    JSON.stringify(
      {
        scanned: result.scanned,
        indexed: result.indexed,
        categoryUpdated: result.categoryUpdated,
        skipped: result.skipped,
        dryRun: result.dryRun,
        samples: result.samples,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
