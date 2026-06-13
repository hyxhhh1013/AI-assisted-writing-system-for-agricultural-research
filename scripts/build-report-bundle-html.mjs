/**
 * Build combined print HTML: weekly report + teacher proposal.
 * Usage: node scripts/build-report-bundle-html.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reports = path.join(root, "docs/reports");
const plans = path.join(root, "docs/plans");

function extractArticle(html) {
  const m = html.match(/<article class="page">[\s\S]*<\/article>/);
  return m ? m[0] : "";
}

function extractStyle(html) {
  const m = html.match(/<style>[\s\S]*<\/style>/);
  return m ? m[0] : "";
}

const weeklyHtml = fs.readFileSync(
  path.join(reports, "周报-2026-06-02至06-06.html"),
  "utf8",
);
const teacherHtml = fs.readFileSync(
  path.join(plans, "ENG-PR-080-导师确认方案.html"),
  "utf8",
);

const weeklyArticle = extractArticle(weeklyHtml);
const teacherArticle = extractArticle(teacherHtml)
  .replace('class="page"', 'class="page part-break"');

const cover = `
<article class="page cover-page" style="text-align:center;padding-top:35mm;">
  <h1 style="font-size:1.6rem;color:#1e4a6e;border:none;">禾书耕文（GrainScript）<br/>汇报汇编</h1>
  <p style="margin-top:2rem;font-size:1rem;color:#555;">统计截止：2026 年 6 月 6 日</p>
  <table style="margin:2.5rem auto 0;font-size:0.95rem;text-align:left;border-collapse:collapse;">
    <tr><td style="padding:0.4rem 1rem;border:1px solid #ccc;"><strong>第一篇</strong></td><td style="padding:0.4rem 1rem;border:1px solid #ccc;">工作周报（6.2 — 6.6，含 5.31—6.1 延续工作）</td></tr>
    <tr><td style="padding:0.4rem 1rem;border:1px solid #ccc;"><strong>第二篇</strong></td><td style="padding:0.4rem 1rem;border:1px solid #ccc;">产品方向调整方案（导师确认稿）</td></tr>
  </table>
  <p style="margin-top:3rem;">汇报人：________________</p>
</article>`;

const styleWeekly = extractStyle(weeklyHtml);
const styleTeacher = extractStyle(teacherHtml);

const out = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>禾书耕文 — 汇报汇编（2026.6.6）</title>
  ${styleWeekly}
  ${styleTeacher.replace("</style>", `
    .part-break { page-break-before: always; }
    .cover-page h1 { border: none !important; }
    .approval-box { background: #e8f0eb; border: 1px solid #b8cfc0; border-radius: 6px; padding: 1rem; margin: 1rem 0; }
    .checkbox-item { display: flex; gap: 0.5rem; margin: 0.5rem 0; }
    .flow { font-family: Consolas, monospace; font-size: 0.85rem; background: #f4f4f2; border: 1px solid #d4d4d4; padding: 0.75rem; white-space: pre-wrap; }
    .timeline-item { display: grid; grid-template-columns: 5.5rem 1fr; gap: 0.75rem; padding: 0.5rem 0; border-bottom: 1px dashed #d4d4d4; }
  </style>`)}
</head>
<body>
  <div class="toolbar no-print" style="max-width:210mm;margin:0 auto 1rem;text-align:right;">
    <button type="button" onclick="window.print()" style="padding:0.5rem 1rem;background:#1e4a6e;color:#fff;border:none;border-radius:4px;cursor:pointer;">打印 / 另存为 PDF</button>
  </div>
  ${cover}
  ${weeklyArticle}
  ${teacherArticle}
</body>
</html>`;

const outPath = path.join(reports, "汇报汇编-2026-06-06.html");
fs.writeFileSync(outPath, out, "utf8");
console.log("Wrote:", outPath);
