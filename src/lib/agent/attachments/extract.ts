import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import {
  formatGridPreview,
  loadTabularGrids,
} from "@/lib/data-block-inventory";
import { describeImage } from "@/lib/agent/attachments/describe-image";
import { describePdfPages } from "@/lib/agent/attachments/describe-pdf";
import {
  ATTACHMENT_ALLOWED_EXTENSIONS,
  ATTACHMENT_IMAGE_EXTENSIONS,
  MAX_ATTACHMENT_TEXT_CHARS,
  MAX_PDF_VISION_PAGES,
} from "@/lib/agent/attachments/constants";
import type { AttachmentExtractSource } from "@/contracts/agent-attachment";

export interface ExtractResult {
  status: "ready" | "extract_failed" | "unsupported";
  text?: string;
  charCount?: number;
  truncated?: boolean;
  source: AttachmentExtractSource;
  error?: string;
}

function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  const copy = new ArrayBuffer(buf.byteLength);
  new Uint8Array(copy).set(buf);
  return copy;
}

/** 带行号列号的原文，供助手自己判断读法，不在这里决定哪一块是数据。 */
async function tabularInventoryText(filePath: string, originalName: string): Promise<string> {
  const grids = await loadTabularGrids(bufferToArrayBuffer(fs.readFileSync(filePath)), originalName);
  if (grids.length === 0) return "(空文件)";
  return [
    "以下是原文行列，不是已经分好的数据表。读完后用 tablesJson 说明：哪张表、表头在第几行、取哪些列、这些数是什么意思。用户确认后才入库。",
    ...grids.map((sheet) => formatGridPreview(sheet.grid, sheet.sheetName)),
  ].join("\n\n");
}

function extOf(filePath: string): string {
  return path.extname(filePath).toLowerCase().replace(/^\./, "");
}

function truncateTo(text: string): { text: string; truncated: boolean } {
  // Postgres text 字段不允许 NUL（\x00）：二进制伪装成文本（.csv/.txt 等）会带 NUL，
  // 提取后入库触发 22021 编码错误 → 上传失败。统一清洗后再截断。
  const clean = text.replace(/\x00/g, "");
  if (clean.length <= MAX_ATTACHMENT_TEXT_CHARS) {
    return { text: clean, truncated: false };
  }
  return { text: clean.slice(0, MAX_ATTACHMENT_TEXT_CHARS), truncated: true };
}

export async function extractAttachmentText(
  filePath: string,
  originalName: string,
): Promise<ExtractResult> {
  const ext = extOf(originalName || filePath);
  if (!ATTACHMENT_ALLOWED_EXTENSIONS.has(ext)) {
    return { status: "unsupported", source: "failed" };
  }
  try {
    if (ext === "txt" || ext === "md" || ext === "tex" || ext === "ris" || ext === "bib") {
      const text = fs.readFileSync(filePath, "utf8");
      return { status: "ready", ...truncateTo(text), source: "text" };
    }
    if (ext === "csv" || ext === "tsv" || ext === "xlsx" || ext === "xls" || ext === "dpt" || ext === "xy") {
      const text = await tabularInventoryText(filePath, originalName);
      return {
        status: "ready",
        ...truncateTo(text),
        source: ext === "xlsx" || ext === "xls" ? "excel" : "csv",
      };
    }
    if (ext === "pdf") {
      // 文字层：pdf-parse v2 为类 API；用后 destroy 释放 pdfjs 文档对象。
      // 文字层失败不阻断视觉理解（Turbopack 环境或部分 PDF 下 getText 可能抛）。
      let text = "";
      try {
        const parser = new PDFParse({ data: fs.readFileSync(filePath) });
        try {
          const result = await parser.getText();
          text = (result.text ?? "").replace(/\n{3,}/g, "\n\n").trim();
        } finally {
          await parser.destroy();
        }
      } catch {
        /* 文字层失败继续走视觉理解 */
      }
      // 图表理解：渲染前 N 页用视觉模型逐页理解（扫描件/图表多的 PDF 也能拿到内容）
      const vision = await describePdfPages(filePath);
      const blocks = [
        text ? `【正文文字】\n${text}` : "",
        vision.status === "ready" && vision.text
          ? `【页面图表理解（前 ${MAX_PDF_VISION_PAGES} 页）】\n${vision.text}`
          : "",
      ].filter(Boolean);
      if (blocks.length === 0) {
        return { status: "extract_failed", source: "image_ocr", error: "PDF 无文本层且页面理解失败" };
      }
      return {
        status: "ready",
        ...truncateTo(blocks.join("\n\n")),
        source: vision.status === "ready" ? "pdf_vision" : "pdf",
      };
    }
    if (ext === "docx") {
      const result = await mammoth.extractRawText({ path: filePath });
      return { status: "ready", ...truncateTo(result.value.trim() || "(空文档)"), source: "docx" };
    }
    if (ext === "tif" || ext === "tiff") {
      return {
        status: "ready",
        ...truncateTo("【已有 TIFF 图】确认登记后会转成 PNG 放进图表库，便于插入正文。不从图片读取数值。"),
        source: "text",
      };
    }
    if (ATTACHMENT_IMAGE_EXTENSIONS.has(ext)) {
      return await describeImage(filePath);
    }
    if (ext === "xy" || ext === "xyd" || ext === "ras" || ext === "raw" || ext === "uxd" || ext === "dif") {
      const buf = fs.readFileSync(filePath);
      const text = buf.toString("utf8");
      const printable = [...text.slice(0, 4000)].filter((ch) => {
        const c = ch.charCodeAt(0);
        return c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127) || c > 159;
      }).length;
      const ratio = text.length === 0 ? 0 : printable / Math.min(text.length, 4000);
      if (ratio < 0.85) {
        return {
          status: "ready",
          ...truncateTo("【仪器谱】二进制谱文件已保存。峰位须峰拟合后以峰表 CSV 入库，不能手填 peaksJson。"),
          source: "spectrum",
        };
      }
      const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 80);
      return {
        status: "ready",
        ...truncateTo(
          `【仪器谱预览】前 ${lines.length} 行（两列文本）。峰位须峰拟合/确认后入库，不能把本预览当 peaksJson。\n${lines.join("\n")}`,
        ),
        source: "spectrum",
      };
    }
    return { status: "unsupported", source: "failed" };
  } catch (err) {
    return {
      status: "extract_failed",
      source: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
