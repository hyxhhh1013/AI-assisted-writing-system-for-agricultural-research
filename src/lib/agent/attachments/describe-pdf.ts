import fs from "fs";
import path from "path";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { createCanvas } from "@napi-rs/canvas";

// Turbopack 打包后 pdfjs 找不到内部相对 worker（Cannot find module './pdf.worker.js'），
// require.resolve 又返回虚拟路径。改用 node_modules 真实路径，pdfjs 可动态 import。
const workerFile = path.join(
  process.cwd(),
  "node_modules",
  "pdfjs-dist",
  "legacy",
  "build",
  "pdf.worker.js",
);
if (fs.existsSync(workerFile)) {
  GlobalWorkerOptions.workerSrc = workerFile;
}
import { describeImageBuffer } from "@/lib/agent/attachments/describe-image";
import {
  MAX_ATTACHMENT_TEXT_CHARS,
  MAX_PDF_VISION_PAGES,
} from "@/lib/agent/attachments/constants";

/** pdfjs 在 Node 无 DOM canvas：用 @napi-rs/canvas 提供渲染目标 */
class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    return { canvas, context };
  }
  reset(c: { canvas: { width: number; height: number }; context: unknown }, width: number, height: number) {
    c.canvas.width = width;
    c.canvas.height = height;
  }
  destroy(c: { canvas: { width: number; height: number } | null; context: unknown }) {
    if (c.canvas) { c.canvas.width = 0; c.canvas.height = 0; }
    c.canvas = null;
    c.context = null;
  }
}

/**
 * 把 PDF 前 N 页渲染为图片并用 GLM-4V 逐页理解（图表/坐标轴/趋势）。
 * 纯文字 PDF 走 pdf-parse；本函数只补「页面视觉」这一层。
 */
export async function describePdfPages(
  filePath: string,
  maxPages = MAX_PDF_VISION_PAGES,
): Promise<{ status: "ready" | "extract_failed"; text?: string; source: "pdf_vision" | "image_ocr"; error?: string }> {
  let doc: PDFDocumentProxy | null = null;
  try {
    const data = new Uint8Array(fs.readFileSync(filePath));
    doc = await getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
    const pageCount = Math.min(doc.numPages || 0, maxPages);
    if (pageCount === 0) {
      return { status: "extract_failed", source: "image_ocr", error: "PDF 无页面" };
    }

    const factory = new NodeCanvasFactory();
    // 并发渲染 + 并发视觉理解：GLM-4V 调用走 callAI 的 per-key 信号量（默认 4），
    // 不会打爆上游；串行会拖到 5×单页耗时，并行可压到一批。
    const pageNumbers = Array.from({ length: pageCount }, (_, i) => i + 1);
    const results = await Promise.all(
      pageNumbers.map(async (num) => {
        try {
          const page = await doc!.getPage(num);
          const viewport = page.getViewport({ scale: 1.2 });
          const cc = factory.create(viewport.width, viewport.height);
          // @napi-rs/canvas 的 SKRSContext2D 与 DOM context 类型不完全一致，运行时兼容
          await page.render({ canvasContext: cc.context as unknown as CanvasRenderingContext2D, viewport }).promise;
          const png = (cc.canvas as { toBuffer: (fmt: string) => Buffer }).toBuffer("image/png");
          factory.destroy(cc);
          const desc = await describeImageBuffer(png, "image/png");
          return { num, desc };
        } catch {
          return { num, desc: null as { status: "extract_failed"; source: "image_ocr"; text?: string; error?: string } | null };
        }
      }),
    );

    const parts = results
      .filter((r): r is { num: number; desc: NonNullable<typeof r.desc> } => r.desc?.status === "ready" && !!r.desc.text)
      .map((r) => `【第 ${r.num} 页】\n${r.desc.text}`);

    if (parts.length === 0) {
      return { status: "extract_failed", source: "image_ocr", error: "PDF 页面渲染/理解失败" };
    }
    const joined = parts.join("\n\n");
    return {
      status: "ready",
      text: joined.slice(0, MAX_ATTACHMENT_TEXT_CHARS),
      source: "pdf_vision",
    };
  } catch (err) {
    return {
      status: "extract_failed",
      source: "image_ocr",
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    try { await doc?.destroy(); } catch { /* ignore */ }
  }
}
