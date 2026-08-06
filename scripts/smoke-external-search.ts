import {
  searchExternalLiterature,
  searchExternalLiteratureWithStats,
} from "../src/lib/literature-search";

async function main() {
  const queries = ["biochar soil amendment", "生物炭 土壤", "10.1038/s41586-021-03456-9"];
  for (const q of queries) {
    let t0 = Date.now();
    try {
      const hits = await searchExternalLiterature(q, { limit: 20, mode: "fast" });
      console.log(`\nfast 「${q}」 ${hits.length} hits in ${Date.now() - t0}ms`);
      for (const h of hits.slice(0, 3)) {
        console.log(`  - [${h.source}] ${h.title.slice(0, 70)} doi=${h.doi ?? "—"}`);
      }
      if (hits.length === 0) console.log("  (empty)");
    } catch (e) {
      console.error(`FAIL search 「${q}」`, e);
    }

    t0 = Date.now();
    try {
      const { hits, variants, sourceCounts } = await searchExternalLiteratureWithStats(q, {
        limit: 20,
        mode: "fast",
      });
      console.log(
        `withStats 「${q}」 ${hits.length} hits variants=${JSON.stringify(variants)} `
          + `${Date.now() - t0}ms counts=${JSON.stringify(sourceCounts)}`,
      );
    } catch (e) {
      console.error(`FAIL withStats 「${q}」`, e);
    }
  }
}

main();
