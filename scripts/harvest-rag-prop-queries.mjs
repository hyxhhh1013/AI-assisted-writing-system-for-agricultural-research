/**
 * 从一份 AgentSession.snapshot JSON 抽出待标注主张。不写数据库。
 *
 *   node scripts/harvest-rag-prop-queries.mjs snapshot.json
 *
 * 输出里的 hitSources 是当时命中。标注人要另补该引哪篇（expectSources），
 * 不能把当时的命中当成金标。
 */

import fs from "fs";
import { harvestRagPropQueries } from "./lib/rag-prop-harvest.mjs";

const file = process.argv[2];
if (!file) {
  console.error("用法: node scripts/harvest-rag-prop-queries.mjs <snapshot.json>");
  process.exit(1);
}
const snapshot = JSON.parse(fs.readFileSync(file, "utf8"));
process.stdout.write(`${JSON.stringify(harvestRagPropQueries(snapshot), null, 2)}\n`);
