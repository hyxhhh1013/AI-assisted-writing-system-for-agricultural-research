/**
 * 按自然周（周一至周日）从 git log 生成周报骨架到 docs/reports/
 * Usage: node scripts/generate-weekly-reports-from-git.mjs [--since=2026-05-01]
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportsDir = path.join(root, "docs/reports");

const sinceArg = process.argv.find((a) => a.startsWith("--since="));
const since = sinceArg?.split("=")[1] ?? "2026-05-01";

function parseLog() {
  const raw = execSync(
    `git log --since="${since}" --pretty=format:"%ad|%h|%s" --date=short`,
    { cwd: root, encoding: "utf8" },
  );
  const lines = raw.trim().split("\n").filter(Boolean);
  return lines.map((line) => {
    const [date, hash, ...rest] = line.split("|");
    return { date, hash, subject: rest.join("|") };
  });
}

/** 周一为一周起点 */
function weekKey(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  return mon.toISOString().slice(0, 10);
}

function weekEnd(mondayStr) {
  const d = new Date(mondayStr + "T12:00:00");
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

function fileName(monday, sunday) {
  return `周报-${monday}至${sunday}.md`;
}

const byWeek = new Map();
for (const c of parseLog()) {
  const mon = weekKey(c.date);
  if (!byWeek.has(mon)) byWeek.set(mon, []);
  byWeek.get(mon).push(c);
}

fs.mkdirSync(reportsDir, { recursive: true });

const written = [];
for (const mon of [...byWeek.keys()].sort()) {
  const sun = weekEnd(mon);
  const commits = byWeek.get(mon);
  const fname = fileName(mon, sun);
  const outPath = path.join(reportsDir, fname);

  const body = `# 禾书耕文（GrainScript）工作周报

> **周期**：${mon}（周一）— ${sun}（周日）  
> **来源**：Git 提交记录自动汇总（\`node scripts/generate-weekly-reports-from-git.mjs\`）  
> **说明**：本文为机器整理骨架，汇报前请按需补「问题/计划/一句话」；详述见 [\`ENGINEERING_OPTIMIZATION_QUEUE.md\`](../ENGINEERING_OPTIMIZATION_QUEUE.md) §4。

## 本周提交（${commits.length} 条）

${commits
  .map((c) => `- \`${c.date}\` ${c.subject} (\`${c.hash}\`)`)
  .join("\n")}

## 待补充（手写）

### 功能开发


### 技术改进


### 问题与解决


### 下周计划


### 一句话总结（给导师）


`;

  const existing = fs.existsSync(outPath)
    ? fs.readFileSync(outPath, "utf8")
    : "";
  const isAutoOnly = existing.includes("Git 提交记录自动汇总");
  const isHandWritten =
    existing.length > 0 &&
    !isAutoOnly &&
    (existing.includes("## 本周工作") ||
      existing.includes("## 一、") ||
      existing.includes("## 摘要"));

  if (!existing || (isAutoOnly && !isHandWritten)) {
    if (!isHandWritten) {
      fs.writeFileSync(outPath, body, "utf8");
      written.push(fname);
    }
  }
}

console.log(
  written.length
    ? `Wrote/updated ${written.length} file(s):\n` + written.map((f) => `  - docs/reports/${f}`).join("\n")
    : "No auto files written (rich reports preserved).",
);
