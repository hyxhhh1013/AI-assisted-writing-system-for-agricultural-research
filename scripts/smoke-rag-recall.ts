/**
 * RAG 召回冒烟 + 分类回归（RAG-PR-013）
 * 用法: npx tsx scripts/smoke-rag-recall.ts
 */
import { localRAG } from "../src/lib/rag";
import { buildRagSearchTerms, expandRagQueries } from "../src/lib/rag-query-expand";

const CASES: Array<{ query: string; expectCat: string }> = [
  { query: "生物炭改良土壤", expectCat: "热化学" },
  { query: "biochar soil amendment", expectCat: "热化学" },
  { query: "热解温度催化剂", expectCat: "热化学" },
  { query: "pyrolysis temperature catalyst", expectCat: "热化学" },
  { query: "控释肥包膜", expectCat: "控释肥类" },
  { query: "绿茶香气挥发性", expectCat: "茶学" },
];

async function runOne(
  query: string,
  opts: { multiQuery?: boolean | "auto"; category?: string } = {},
) {
  const t0 = Date.now();
  const results = await localRAG.search(query, { limit: 10, ...opts });
  const ms = Date.now() - t0;
  const top = results[0];
  return {
    query,
    count: results.length,
    ms,
    topSource: top?.metadata?.source?.slice(0, 60) ?? "—",
    topCat: top?.metadata?.category ?? "—",
    top3Cats: results.slice(0, 3).map((r) => r.metadata.category),
    terms: buildRagSearchTerms(query).length,
    variants: expandRagQueries(query).length,
  };
}

async function main() {
  console.log("=== RAG recall smoke (RAG-PR-013) ===\n");
  const cats = await localRAG.getCategories();
  console.log(`Categories (${cats.length}): ${cats.join(", ")}\n`);

  const rows: Awaited<ReturnType<typeof runOne>>[] = [];
  let catFails = 0;

  for (const c of CASES) {
    const auto = await runOne(c.query, { multiQuery: "auto" });
    const off = await runOne(c.query, { multiQuery: false });
    rows.push(auto, off);

    const ok = auto.topCat === c.expectCat || auto.top3Cats.includes(c.expectCat);
    if (!ok) {
      catFails += 1;
      console.error(`FAIL cat: 「${c.query}」 top=${auto.topCat} top3=${auto.top3Cats.join(",")} expect=${c.expectCat}`);
    } else {
      console.log(`OK cat: 「${c.query}」 → ${auto.topCat} (top3: ${auto.top3Cats.join(", ")})`);
    }
  }

  console.table(
    rows.map((r, i) => ({
      query: r.query.slice(0, 28),
      mode: i % 2 === 0 ? "auto" : "single",
      hits: r.count,
      ms: r.ms,
      topCat: r.topCat,
    })),
  );

  const autoRows = rows.filter((_, i) => i % 2 === 0);
  const singleRows = rows.filter((_, i) => i % 2 === 1);
  const autoMs = autoRows.reduce((s, r) => s + r.ms, 0);
  const singleMs = singleRows.reduce((s, r) => s + r.ms, 0);
  console.log(`\nLatency sum: auto=${autoMs}ms single=${singleMs}ms ratio=${(autoMs / Math.max(1, singleMs)).toFixed(2)}`);

  const zero = rows.filter((r) => r.count === 0);
  if (zero.length > 0) {
    console.error("\nFAIL: zero-hit queries:", zero.map((z) => z.query));
    process.exit(1);
  }
  if (catFails > 0) {
    console.error(`\nFAIL: ${catFails} category regression(s)`);
    process.exit(1);
  }
  console.log("\nOK: hits + category regressions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
