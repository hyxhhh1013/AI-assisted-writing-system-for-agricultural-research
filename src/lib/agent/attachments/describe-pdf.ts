import fs from "fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { createCanvas } from "@napi-rs/canvas";
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
    const parts: string[] = [];
    for (let i = 1; i <= pageCount; i++) {
      try {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const cc = factory.create(viewport.width, viewport.height);
        // @napi-rs/canvas 的 SKRSContext2D 与 DOM context 类型不完全一致，运行时兼容
        await page.render({ canvasContext: cc.context as unknown as CanvasRenderingContext2D, viewport }).promise;
        const png = (cc.canvas as { toBuffer: (fmt: string) => Buffer }).toBuffer("image/png");
        factory.destroy(cc);
        const desc = await describeImageBuffer(png, "image/png");
        if (desc.status === "ready" && desc.text) {
          parts.push(`【第 ${i} 页】\n${desc.text}`);
        }
      } catch {
        /* 单页失败跳过（如损坏页），不中断整体 */
      }
    }

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
