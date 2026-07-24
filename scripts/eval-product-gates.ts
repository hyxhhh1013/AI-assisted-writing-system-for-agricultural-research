/**
 * 本地/CI 产品门禁（无 LLM）
 * 运行：npx tsx scripts/eval-product-gates.ts
 * 或：npm run eval:gates
 */
import {
  runProductGateCases,
  summarizeProductGateResults,
} from "../src/lib/eval/product-gates";

const results = runProductGateCases();
const summary = summarizeProductGateResults(results);

console.log(`W3-E2E-EVAL product gates: ${summary.passed} passed, ${summary.failed} failed`);
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.id} — ${r.detail}`);
}

if (summary.failed > 0) {
  process.exit(1);
}
