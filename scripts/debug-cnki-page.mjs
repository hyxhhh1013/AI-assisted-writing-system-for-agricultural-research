/** 查看 CNKI 论文首页文本 */
import fs from "fs";
import pdfjs from "pdfjs-dist/legacy/build/pdf.js";

async function show(filepath) {
  const data = new Uint8Array(fs.readFileSync(filepath));
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const tc = await page.getTextContent();
  const text = tc.items.map(i => ("str" in i ? i.str : "")).join(" ").replace(/\s+/g, " ").trim();
  console.log(`=== ${filepath.split(/[\\/]/).pop()} ===`);
  console.log(text.slice(0, 3000));
  console.log("");
}

const files = [
  "D:\\project\\论文助手\\papers\\烟花\\含能复合催化剂对微烟推进剂燃烧性能的影响_赵凤起.pdf",
  "D:\\project\\论文助手\\papers\\烟花\\含能金属有机框架在火炸药中的研究进展_郭睿鹏.pdf",
];
for (const f of files) await show(f);
