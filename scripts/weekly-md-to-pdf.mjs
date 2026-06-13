/**
 * Convert docs/reports/周报-*.md → .html → .pdf (Playwright).
 * Usage: node scripts/weekly-md-to-pdf.mjs [--force-html]
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportsDir = path.join(root, "docs/reports");
const forceHtml = process.argv.includes("--force-html");

const PRINT_CSS = `
:root { --ink:#1a1a1a; --muted:#555; --accent:#1e4a6e; --accent-light:#e8eef3; --border:#d4d4d4; --paper:#fafaf8; }
* { box-sizing: border-box; }
body { font-family: "Source Han Serif SC","Noto Serif SC","SimSun",serif; font-size:10.5pt; line-height:1.6; color:var(--ink); background:#e8e6e1; margin:0; padding:1.5rem; }
.page { max-width:210mm; margin:0 auto; background:var(--paper); padding:20mm 18mm 22mm; box-shadow:0 2px 24px rgba(0,0,0,.08); }
header.doc-header { border-bottom:2px solid var(--accent); padding-bottom:0.9rem; margin-bottom:1.2rem; }
h1 { font-size:1.45rem; font-weight:700; color:var(--accent); margin:0 0 0.5rem; }
.meta { color:var(--muted); font-size:0.88rem; margin:0.25rem 0; }
h2 { font-size:1.08rem; color:var(--accent); margin:1.35rem 0 0.6rem; padding-bottom:0.3rem; border-bottom:1px solid var(--border); page-break-after:avoid; }
h3 { font-size:0.98rem; margin:0.9rem 0 0.4rem; color:#333; }
p { margin:0.45rem 0; text-align:justify; }
ul,ol { margin:0.35rem 0 0.65rem 1.2rem; }
li { margin:0.2rem 0; }
table { width:100%; border-collapse:collapse; font-size:0.88rem; margin:0.55rem 0 0.85rem; }
th,td { border:1px solid var(--border); padding:0.4rem 0.5rem; text-align:left; vertical-align:top; }
th { background:var(--accent-light); font-weight:600; color:var(--accent); }
blockquote { margin:0.6rem 0; padding:0.5rem 0.75rem; border-left:4px solid var(--accent); background:var(--accent-light); }
code { font-family:Consolas,monospace; font-size:0.85em; background:#f4f4f2; padding:0.1em 0.35em; }
pre { font-family:Consolas,monospace; font-size:0.78rem; background:#f4f4f2; border:1px solid var(--border); padding:0.6rem 0.75rem; white-space:pre-wrap; }
.summary-box { background:var(--accent-light); border-left:4px solid var(--accent); padding:0.75rem 1rem; margin:0.75rem 0 1rem; }
.sign-block { margin-top:1.8rem; display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; }
.sign-line { border-bottom:1px solid var(--ink); min-height:1.8rem; margin-top:1.5rem; }
@media print { body{background:white;padding:0} .page{box-shadow:none;max-width:none;padding:0} .no-print{display:none!important} h2,table,blockquote{page-break-inside:avoid} }
`;

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineMd(s) {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function mdToHtmlBody(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inUl = false;
  let inTable = false;
  let tableRows = [];
  let metaLines = [];
  let pastTitle = false;

  function flushUl() {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
  }

  function flushTable() {
    if (!inTable) return;
    if (tableRows.length >= 1) {
      out.push("<table>");
      tableRows.forEach((row, i) => {
        const cells = row
          .split("|")
          .map((c) => c.trim())
          .filter((c) => c.length > 0);
        if (cells.every((c) => /^-+$/.test(c))) return;
        const tag = i === 0 && tableRows.length > 1 ? "th" : "td";
        const rowTag = tag === "th" ? "thead><tr" : "tr";
        if (tag === "th") out.push("<thead><tr>");
        else if (i === 1 && tableRows[0]) out.push("<tbody>");
        out.push(
          `<tr>${cells.map((c) => `<${tag}>${inlineMd(c)}</${tag}>`).join("")}</tr>`,
        );
        if (tag === "th") out.push("</thead>");
      });
      out.push("</tbody></table>");
    }
    tableRows = [];
    inTable = false;
  }

  for (const line of lines) {
    const t = line.trim();

    if (t === "---") {
      flushUl();
      flushTable();
      continue;
    }

    if (t.startsWith("# ")) {
      flushUl();
      flushTable();
      const title = inlineMd(t.slice(2));
      out.push(`<header class="doc-header"><h1>${title}</h1>`);
      metaLines = [];
      pastTitle = true;
      continue;
    }

    if (
      pastTitle &&
      metaLines &&
      !t.startsWith("##") &&
      !t.startsWith("###") &&
      !t.startsWith("-") &&
      !t.startsWith("|") &&
      !t.startsWith(">") &&
      t.startsWith("**") &&
      t.includes("**：")
    ) {
      metaLines.push(`<p class="meta">${inlineMd(t)}</p>`);
      continue;
    }

    if (metaLines && (t.startsWith("##") || (t === "" && metaLines.length > 0))) {
      out.push(metaLines.join("\n"));
      out.push("</header>");
      metaLines = null;
    }

    if (t.startsWith("## ")) {
      flushUl();
      flushTable();
      out.push(`<h2>${inlineMd(t.slice(3))}</h2>`);
      continue;
    }

    if (t.startsWith("### ")) {
      flushUl();
      flushTable();
      out.push(`<h3>${inlineMd(t.slice(4))}</h3>`);
      continue;
    }

    if (t.startsWith("|")) {
      flushUl();
      inTable = true;
      tableRows.push(t);
      continue;
    } else flushTable();

    if (t.startsWith("- ")) {
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${inlineMd(t.slice(2))}</li>`);
      continue;
    } else flushUl();

    if (t.startsWith("> ")) {
      flushUl();
      out.push(`<blockquote><p>${inlineMd(t.slice(2))}</p></blockquote>`);
      continue;
    }

    if (t === "") continue;

    flushUl();
    out.push(`<p>${inlineMd(t)}</p>`);
  }

  flushUl();
  flushTable();
  if (metaLines?.length) {
    out.push(metaLines.join("\n"));
    out.push("</header>");
  }

  return out.join("\n");
}

function wrapHtml(title, body) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<title>${escapeHtml(title)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
<div class="toolbar no-print" style="max-width:210mm;margin:0 auto 1rem;text-align:right">
<button type="button" onclick="window.print()" style="padding:0.45rem 1rem;background:#1e4a6e;color:#fff;border:none;border-radius:4px;cursor:pointer">打印 / 另存为 PDF</button>
</div>
<article class="page">
${body}
</article>
</body>
</html>`;
}

function listWeeklyMd() {
  return fs
    .readdirSync(reportsDir)
    .filter((f) => /^周报-.*\.md$/i.test(f))
    .sort();
}

const files = listWeeklyMd();
if (files.length === 0) {
  console.error("No 周报-*.md in docs/reports");
  process.exit(1);
}

const browser = await chromium.launch();
try {
  for (const mdFile of files) {
    const base = mdFile.replace(/\.md$/i, "");
    const mdPath = path.join(reportsDir, mdFile);
    const htmlPath = path.join(reportsDir, `${base}.html`);
    const pdfPath = path.join(reportsDir, `${base}.pdf`);

    const md = fs.readFileSync(mdPath, "utf8");
    const titleMatch = md.match(/^#\s+(.+)/m);
    const title = titleMatch?.[1] ?? base;

    if (forceHtml || !fs.existsSync(htmlPath)) {
      const body = mdToHtmlBody(md);
      fs.writeFileSync(htmlPath, wrapHtml(title, body), "utf8");
      console.log("HTML:", htmlPath);
    }

    const htmlToUse = htmlPath;
    const page = await browser.newPage();
    const fileUrl = `file:///${htmlToUse.replace(/\\/g, "/")}`;
    await page.goto(fileUrl, { waitUntil: "networkidle" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", bottom: "18mm", left: "18mm", right: "18mm" },
    });
    await page.close();
    console.log("PDF:", pdfPath);
  }
} finally {
  await browser.close();
}

console.log(`Done: ${files.length} weekly report(s).`);
