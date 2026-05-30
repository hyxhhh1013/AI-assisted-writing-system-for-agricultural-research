import fs from "fs";
import pdfjs from "pdfjs-dist/legacy/build/pdf.js";
import { extractFromFirstPage, extractFromFilename, mergeBibEntries } from "./extractors/journal.mjs";

const testFile = process.argv[2] || "D:\\project\\论文助手\\papers\\烟花\\含能金属有机框架在火炸药中的研究进展_郭睿鹏.pdf";

async function test(fp) {
  const data = new Uint8Array(fs.readFileSync(fp));
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const tc = await page.getTextContent();
  const firstPageText = tc.items.map(i => ("str" in i ? i.str : "")).join(" ").replace(/\s+/g, " ").trim();

  const fname = fp.split(/[\\/]/).pop();
  const fromFile = extractFromFilename(fname);
  const fromPage = extractFromFirstPage(firstPageText);
  const merged = mergeBibEntries(fromFile, fromPage);

  console.log("File:", fname);
  console.log("fromFile:", JSON.stringify(fromFile, null, 2));
  console.log("fromPage:", JSON.stringify(fromPage, null, 2));
  console.log("merged:", JSON.stringify(merged, null, 2));
}

test(testFile);
