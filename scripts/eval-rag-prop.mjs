/**
 * 主张 recall@10。
 * 未设置 RAG_PROP_EVAL=1 时不读取本地索引。
 *
 *   RAG_PROP_EVAL=1 npx tsx scripts/eval-rag-prop.mjs src/__tests__/fixtures/rag-prop-queries.json
 *
 * 默认 vitest 不跑这条命令。真题库的期望来源必须是人工标的该引文献，不是当时命中。
 */

import fs from "fs";
import { parseRagPropQueries } from "./lib/rag-prop-fixtures.mjs";
import { recallAt10 } from "./lib/rag-prop-eval.mjs";

if (process.env.RAG_PROP_EVAL !== "1") {
  console.log("未设置 RAG_PROP_EVAL=1，不读取本地索引。");
  process.exit(0);
}

const file = process.argv[2];
if (!file) {
  console.error("用法: RAG_PROP_EVAL=1 npx tsx scripts/eval-rag-prop.mjs <queries.json>");
  process.exit(1);
}

const queries = parseRagPropQueries(JSON.parse(fs.readFileSync(file, "utf8")));
const { searchWritingRagChunks } = await import("../src/services/writing-context.ts");

const cases = [];
for (const row of queries) {
  const searched = await searchWritingRagChunks({
    title: row.title,
    section: row.section,
    context: row.query,
    claims: [row.query],
  });
  const rankedSources = [];
  for (const chunk of searched.chunks) {
    const source = chunk?.metadata?.source;
    if (source && !rankedSources.includes(source)) rankedSources.push(source);
  }
  cases.push({ expectSources: row.expectSources, rankedSources });
}

const score = recallAt10(cases);
console.log(
  JSON.stringify(
    {
      queries: queries.length,
      recallAt10: score,
      note: "期望来源是人工标注。当时的检索命中不是金标。",
    },
    null,
    2,
  ),
);
