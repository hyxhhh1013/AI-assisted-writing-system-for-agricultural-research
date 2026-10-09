/**
 * 单页成图 PDF：数页数，并把第一页渲成 PNG。
 * 多页 PDF 不当成图，避免把论文首页登记进图表库。
 */

import fs from "fs";
import path from "path";
import type { PDFDocumentProxy } from "pdfjs-dist";

const workerFile = path.join(
  process.cwd(),
  "node_modules",
  "pdfjs-dist",
  "legacy",
  "build",
  "pdf.worker.js",
);

export async function countPdfPages(source: Buffer): Promise<number> {
  if (!source || source.length < 5) return 0;
  let doc: { numPages: number; destroy: () => Promise<void> } | null = null;
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf");
    if (fs.existsSync(workerFile)) {
      pdfjs.GlobalWorkerOptions.workerSrc = workerFile;
    }
    doc = await pdfjs.getDocument({
      data: new Uint8Array(source),
      useSystemFonts: true,
      isEvalSupported: false,
    }).promise;
    return doc.numPages || 0;
  } catch {
    return 0;
  } finally {
    try { await doc?.destroy(); } catch { /* ignore */ }
  }
}

/** 只渲染单页 PDF。多页或打不开时返回 null。 */
export async function renderPdfFirstPagePng(source: Buffer): Promise<Buffer | null> {
  if (!source || source.length < 5) return null;
  let doc: PDFDocumentProxy | null = null;
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf");
    const { createCanvas } = await import("@napi-rs/canvas");
    if (fs.existsSync(workerFile)) {
      pdfjs.GlobalWorkerOptions.workerSrc = workerFile;
    }
    doc = await pdfjs.getDocument({
      data: new Uint8Array(source),
      useSystemFonts: true,
      isEvalSupported: false,
    }).promise;
    if (!doc || (doc.numPages || 0) !== 1) return null;
    const page = await doc.getPage(1);
    let viewport = page.getViewport({ scale: 2 });
    if (viewport.width > 2400) {
      viewport = page.getViewport({ scale: 2 * (2400 / viewport.width) });
    }
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    return canvas.toBuffer("image/png");
  } catch {
    return null;
  } finally {
    try { await doc?.destroy(); } catch { /* ignore */ }
  }
}
