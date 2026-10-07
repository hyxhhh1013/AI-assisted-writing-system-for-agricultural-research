/**
 * 深夜影子重建。只写 data/shadow，不覆盖线上索引。
 *
 *   node scripts/shadow-reading-order.mjs --category=热化学
 *   node scripts/shadow-reading-order.mjs --files=a.pdf,b.pdf
 *
 * 北京时间 00:30–05:00 之外直接退出。到 05:00 停，下一夜加 --resume 续。
 * 一次只能一个分类。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pdfjs from "pdfjs-dist/legacy/build/pdf.js";
import { isDeepNightWindow } from "./lib/reading-order-repair.mjs";
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

function now() {
  const stamped = process.env.RAG_PROP_NOW ? new Date(process.env.RAG_PROP_NOW) : new Date();
  if (Number.isNaN(stamped.getTime())) {
    console.error("RAG_PROP_NOW 不是有效时间");
    process.exit(1);
  }
  return stamped;
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
  const clock = now();
  if (!isDeepNightWindow(clock)) {
    console.log("不在深夜窗口 00:30–05:00（北京时间），已退出，未读写索引。");
    process.exit(0);
  }
  const names = argValue("--files").split(",").map((name) => name.trim()).filter(Boolean);
  const category = argValue("--category");
  const files = selectShadowFiles(listPdfFiles(articlesDir), { names, category });
  const resumePath = path.join(shadowRoot, "resume.json");
  const resume = fs.existsSync(resumePath) ? JSON.parse(fs.readFileSync(resumePath, "utf8")) : { done: [] };
  const done = new Set(process.argv.includes("--resume") ? resume.done || [] : []);
  fs.mkdirSync(shadowRoot, { recursive: true });
  let wrote = 0;
  for (const fileInfo of files) {
    if (!isDeepNightWindow(now())) {
      fs.writeFileSync(resumePath, JSON.stringify({ category: fileInfo.category, done: [...done] }, null, 2));
      console.log("已到 05:00，停止。下一夜用 --resume 续。未改线上索引。");
      process.exit(0);
    }
    if (done.has(fileInfo.name)) continue;
    const target = await shadowOnePdf(fileInfo);
    done.add(fileInfo.name);
    wrote += 1;
    console.log(`影子 ${fileInfo.name} → ${path.relative(root, target)}`);
  }
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
