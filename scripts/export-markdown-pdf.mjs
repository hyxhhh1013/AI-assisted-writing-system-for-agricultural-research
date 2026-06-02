/**
 * 将 Markdown 导出为 PDF（Playwright + CDN marked/mermaid）
 * 用法: node scripts/export-markdown-pdf.mjs <input.md> [output.pdf]
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const input = resolve(process.argv[2] || "docs/SOFTWARE_DESIGN_OVERVIEW.md");
const output =
  process.argv[3] ||
  input.replace(/\.md$/i, ".pdf");

const md = readFileSync(input, "utf8");
const mdJson = JSON.stringify(md);
const tmpHtml = join(dirname(input), `_pdf_export_${Date.now()}.html`);

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>PDF Export</title>
  <style>
    @page { margin: 18mm 16mm; }
    body {
      font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
      font-size: 10.5pt;
      line-height: 1.55;
      color: #1a1a1a;
      max-width: 100%;
    }
    h1 { font-size: 20pt; margin-top: 0; }
    h2 { font-size: 14pt; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-top: 1.4em; }
    h3 { font-size: 12pt; }
    table { border-collapse: collapse; width: 100%; margin: 0.8em 0; font-size: 9.5pt; }
    th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; }
    th { background: #f5f5f5; }
    pre, code { font-family: Consolas, "Courier New", monospace; }
    pre {
      background: #f6f8fa;
      padding: 10px 12px;
      overflow-x: auto;
      font-size: 8.5pt;
      border-radius: 4px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    code { background: #f0f0f0; padding: 1px 4px; border-radius: 2px; font-size: 9pt; }
    blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 12px; color: #444; }
    .mermaid { text-align: center; margin: 1em 0; }
    hr { border: none; border-top: 1px solid #e0e0e0; margin: 1.5em 0; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
</head>
<body>
  <div id="root"></div>
  <script>
    const raw = ${mdJson};
    marked.setOptions({ gfm: true, breaks: false });
    document.getElementById("root").innerHTML = marked.parse(raw);
    mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose" });
    (async () => {
      const nodes = document.querySelectorAll("pre code.language-mermaid");
      for (const node of nodes) {
        const parent = node.parentElement;
        const div = document.createElement("div");
        div.className = "mermaid";
        div.textContent = node.textContent;
        parent.replaceWith(div);
      }
      await mermaid.run({ querySelector: ".mermaid" });
      window.__PDF_READY__ = true;
    })().catch((e) => {
      console.error(e);
      window.__PDF_READY__ = true;
    });
  </script>
</body>
</html>`;

writeFileSync(tmpHtml, html, "utf8");

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForFunction(() => window.__PDF_READY__ === true, { timeout: 90_000 });
  await page.pdf({
    path: output,
    format: "A4",
    printBackground: true,
    margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
  });
  console.log(output);
} finally {
  await browser.close();
  try {
    unlinkSync(tmpHtml);
  } catch {
    /* ignore */
  }
}
