/** 查看几个中文 PDF 首页提取的原始文本 */
import fs from "fs";
import path from "path";
import pdfjs from "pdfjs-dist/legacy/build/pdf.js";

async function showFirstPage(filepath) {
  const data = new Uint8Array(fs.readFileSync(filepath));
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const textContent = await page.getTextContent();
  const text = textContent.items.map(i => ("str" in i ? i.str : "")).join(" ").replace(/\s+/g, " ").trim();
  console.log(`=== ${path.basename(filepath)} ===`);
  console.log(text.slice(0, 2000));
  console.log("");
}

const papersDir = "D:\\project\\论文助手\\papers";
// Find some Chinese PDFs
function findChinese(dir, max = 3) {
  const results = [];
  function walk(d) {
    if (results.length >= max) return;
    for (const item of fs.readdirSync(d)) {
      const full = path.join(d, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) { walk(full); }
      else if (item.endsWith(".pdf") && /[一-鿿]/.test(item)) {
        results.push(full);
        if (results.length >= max) return;
      }
    }
  }
  walk(dir);
  return results;
}

const cnPdfs = findChinese(papersDir, 3);
for (const f of cnPdfs) await showFirstPage(f);
