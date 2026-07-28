/**
 * 冒烟：外部检索 → 摘要入库知识库（不写项目参考文献，避免污染用户项目）
 * 用法：npx tsx scripts/smoke-external-kb-ingest.ts
 */
import fs from "fs";
import path from "path";
import { searchExternalLiterature } from "../src/lib/literature-search";
import { ingestExternalHitToKnowledge } from "../src/lib/external-knowledge-ingest";
import { isSoftGroundable } from "../src/lib/reference-evidence";

async function main() {
  const query = process.argv[2] || "biochar soil amendment";
  console.log(`\n== search 「${query}」 ==`);
  const t0 = Date.now();
  const hits = await searchExternalLiterature(query, { limit: 5, mode: "fast" });
  console.log(`hits=${hits.length} in ${Date.now() - t0}ms`);

  const withAbs = hits.filter((h) => isSoftGroundable(h.abstract));
  const pick = withAbs[0] ?? hits[0];
  if (!pick) {
    console.error("no hits");
    process.exit(1);
  }
  console.log(
    `pick: ${pick.title.slice(0, 80)} doi=${pick.doi ?? "—"} abstract=${pick.abstract?.length ?? 0}chars oa=${pick.isOpenAccess ? "Y" : "N"}`,
  );

  console.log("\n== ingest to knowledge (category=外部摘要) ==");
  const t1 = Date.now();
  const result = await ingestExternalHitToKnowledge({
    hit: pick,
    category: "外部摘要",
  });
  console.log(`result in ${Date.now() - t1}ms:`, result);

  const indexPath = path.join(process.cwd(), "data", "index_外部摘要.json");
  if (fs.existsSync(indexPath)) {
    const chunks = JSON.parse(fs.readFileSync(indexPath, "utf-8")) as Array<{
      metadata?: { source?: string };
    }>;
    const mine = chunks.filter((c) => c.metadata?.source === result.name);
    console.log(`index_外部摘要.json: total=${chunks.length}, thisSource=${mine.length}`);
  } else {
    console.log("index_外部摘要.json: (missing — bib_only or write failed)");
  }

  if (result.mode === "abstract" && result.chunkCount < 1) {
    console.error("FAIL: expected abstract chunks");
    process.exit(1);
  }
  console.log("\nOK smoke-external-kb-ingest");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
