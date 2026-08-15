/**
 * 论文质量评测脚本：对一份「章节文本 + 参考文献」清单四维打分。
 *
 * 运行：
 *   npx tsx scripts/eval-quality.ts                 # 无参数：输出内置 golden 好/坏样例对比
 *   npx tsx scripts/eval-quality.ts path/to.json    # 读自定义 manifest 打分
 *
 * manifest 格式（见 src/lib/quality-eval/types.ts QualityEvalInput）：
 * {
 *   "title": "论文标题",
 *   "sections": [{ "key": "introduction", "title": "引言", "content": "..." }],
 *   "references": [{ "index": 1, "title": "...", "abstract": "..." }]
 * }
 *
 * 说明：这是确定性规则尺（不调 LLM），用于给 prompt/门禁改动一个可度量的方向；
 * 引用 claim 级判定另见 validate_citations 的 claimGrounding（收口默认开；CITATION_CLAIM_GROUNDING=0 关闭）。
 */
import fs from "fs";
import path from "path";
import { BAD_PAPER, GOOD_PAPER } from "../src/lib/quality-eval/fixtures";
import { evaluateQuality } from "../src/lib/quality-eval/score";
import type { QualityEvalInput } from "../src/lib/quality-eval/types";

function printReport(title: string, input: QualityEvalInput): void {
  const r = evaluateQuality(input);
  console.log(`\n========== ${title} — 总分 ${r.overallScore}/100 ==========`);
  for (const d of r.dimensions) {
    console.log(`\n[${d.label}] ${d.score}/100`);
    for (const s of d.strengths) console.log(`  + ${s}`);
    for (const i of d.issues) console.log(`  - ${i}`);
  }
}

function main(): void {
  const arg = process.argv[2];
  if (!arg) {
    console.log("用法：npx tsx scripts/eval-quality.ts [manifest.json]");
    console.log("无参数时输出内置 golden 好/坏样例对比。\n");
    printReport("好样例", GOOD_PAPER);
    printReport("坏样例", BAD_PAPER);
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(path.resolve(arg), "utf-8")) as QualityEvalInput;
  printReport(manifest.title ?? "论文", manifest);
}

main();
