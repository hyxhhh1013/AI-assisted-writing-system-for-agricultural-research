/**
 * 影子重建。只写 data/shadow，不覆盖线上索引。
 *
 *   node scripts/shadow-reading-order.mjs --category=热化学
 *   node scripts/shadow-reading-order.mjs --files=a.pdf,b.pdf
 *
 * 不限时钟。一次只能一个分类。中断后用 --resume 续。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pdfjs from "pdfjs-dist/legacy/build/pdf.js";
import {
  buildShadowPages,
  chunkShadowPages,
  listPdfFiles,
  selectShadowFiles,
  writeShadowDocument,
} from "./lib/shadow-index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const articlesDir = path.resolve(root, process.env.RAG_ARTICLES_DIR || "papers");
const shadowRoot = path.resolve(root, "data", "shadow");

function argValue(flag) {
  const hit = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : "";
}

export async function shadowOnePdf(fileInfo) {
  const data = new Uint8Array(fs.readFileSync(fileInfo.path));
  const pdf = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const pageInputs = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    pageInputs.push({ page: pageNumber, items: textContent.items || [] });
  }
  const pages = buildShadowPages(pageInputs);
  const chunks = chunkShadowPages(pages, fileInfo.name, fileInfo.category);
  const crossColumnPages = pages.filter((page) => page.keptOld).map((page) => page.page);
  return writeShadowDocument(shadowRoot, fileInfo, {
    source: fileInfo.name,
    category: fileInfo.category,
    mtime: fileInfo.mtime,
    chunks,
    crossColumnPages,
    builtAt: new Date().toISOString(),
  });
}

async function main() {
  const names = argValue("--files").split(",").map((name) => name.trim()).filter(Boolean);
  const category = argValue("--category");
  const files = selectShadowFiles(listPdfFiles(articlesDir), { names, category });
  const resumePath = path.join(shadowRoot, "resume.json");
  const resume = fs.existsSync(resumePath) ? JSON.parse(fs.readFileSync(resumePath, "utf8")) : { done: [] };
  const done = new Set(process.argv.includes("--resume") ? resume.done || [] : []);
  fs.mkdirSync(shadowRoot, { recursive: true });
  const progressPath = path.join(shadowRoot, "progress.json");
  const writeProgress = (written, lastFile, finished) => {
    fs.writeFileSync(progressPath, JSON.stringify({
      category: files[0].category,
      fileCount: files.length,
      written,
      lastFile,
      finished,
      updatedAt: new Date().toISOString(),
    }));
  };
  let wrote = 0;
  writeProgress(done.size, null, false);
  for (const fileInfo of files) {
    if (done.has(fileInfo.name)) continue;
    const target = await shadowOnePdf(fileInfo);
    done.add(fileInfo.name);
    wrote += 1;
    writeProgress(done.size, fileInfo.name, false);
    console.log(`影子 ${fileInfo.name} → ${path.relative(root, target)}`);
  }
  writeProgress(done.size, null, true);
  fs.writeFileSync(resumePath, JSON.stringify({ category: files[0].category, done: [...done] }, null, 2));
  console.log(`完成 ${wrote} 篇，分类「${files[0].category}」。线上索引未改。`);
}

const ranAsScript = process.argv[1]
  && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (ranAsScript) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
