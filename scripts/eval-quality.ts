/**
 * 论文质量评测脚本：确定性四维（CI 地板）+ 可选 LLM-judge（回归对照）。
 *
 * 运行：
 *   npx tsx scripts/eval-quality.ts                 # 内置 golden 好/坏样例
 *   npx tsx scripts/eval-quality.ts path/to.json    # 自定义 manifest
 *   npx tsx scripts/eval-quality.ts --no-llm        # 只打规则分
 *
 * 规则尺不调 LLM，始终打印。LLM 尺用 verifier；无 key / 失败则跳过，退出码仍 0。
 * 禁止把 LLM-judge 接到 write_section 热路径。
 */
import fs from "fs";
import path from "path";
import { BAD_PAPER, GOOD_PAPER } from "../src/lib/quality-eval/fixtures";
import { evaluateQualityLlm } from "../src/lib/quality-eval/llm-judge";
import { evaluateQuality } from "../src/lib/quality-eval/score";
import type { QualityEvalInput, QualityLlmReport } from "../src/lib/quality-eval/types";

function printRuleReport(title: string, input: QualityEvalInput): void {
  const r = evaluateQuality(input);
  console.log(`\n========== ${title} — 规则分 ${r.overallScore}/100 ==========`);
  for (const d of r.dimensions) {
    console.log(`\n[${d.label}] ${d.score}/100`);
    for (const s of d.strengths) console.log(`  + ${s}`);
    for (const i of d.issues) console.log(`  - ${i}`);
  }
}

function printLlmReport(title: string, llm: QualityLlmReport): void {
  if (llm.skipped) {
    console.log(`\n---------- ${title} — LLM 分：跳过（${llm.skipReason ?? "无 key 或调用失败"}） ----------`);
    return;
  }
  console.log(`\n---------- ${title} — LLM 分 ${llm.overallScore}/100 ----------`);
  for (const d of llm.dimensions) {
    const comment = d.comment ? `  ${d.comment}` : "";
    console.log(`  [${d.label}] ${d.score}/100${comment}`);
  }
}

async function scoreOne(title: string, input: QualityEvalInput, withLlm: boolean): Promise<void> {
  printRuleReport(title, input);
  if (!withLlm) return;
  const llm = await evaluateQualityLlm(input);
  printLlmReport(title, llm);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const noLlm = args.includes("--no-llm");
  const file = args.find((a) => !a.startsWith("--"));
  const withLlm = !noLlm;

  if (!file) {
    console.log("用法：npx tsx scripts/eval-quality.ts [manifest.json] [--no-llm]");
    console.log("无参数时输出内置 golden 好/坏样例对比。规则尺始终打印；LLM 尺无 key 则跳过。\n");
    await scoreOne("好样例", GOOD_PAPER, withLlm);
    await scoreOne("坏样例", BAD_PAPER, withLlm);
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(path.resolve(file), "utf-8")) as QualityEvalInput;
  await scoreOne(manifest.title ?? "论文", manifest, withLlm);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
