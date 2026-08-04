import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import papa from "papaparse";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
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

/** CSV / Excel → Markdown 表格 */
function toMarkdownTable(rows: unknown[][]): string {
  if (rows.length === 0) return "";
  const header = rows[0].map((c) => String(c ?? ""));
  const body = rows.slice(1);
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
  const headLine = `| ${header.map(esc).join(" | ")} |`;
  const sepLine = `| ${header.map(() => "---").join(" | ")} |`;
  const bodyLines = body
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
    .slice(0, 500)
    .map((r) => `| ${r.map((c) => esc(String(c ?? ""))).join(" | ")} |`);
  const parts = [headLine, sepLine, ...bodyLines];
  if (body.length > 500) parts.push("...（仅展示前 500 行）");
  return parts.join("\n");
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
    if (ext === "csv") {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = papa.parse<string[]>(raw, { skipEmptyLines: true }) as {
        data: string[][];
      };
      const text = toMarkdownTable(parsed.data);
      return { status: "ready", ...truncateTo(text || "(空表格)"), source: "csv" };
    }
    if (ext === "xlsx" || ext === "xls") {
      const wb = XLSX.readFile(filePath);
      const parts: string[] = [];
      for (const sheetName of wb.SheetNames.slice(0, 5)) {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1 });
        parts.push(`### ${sheetName}\n${toMarkdownTable(rows)}`);
      }
      return { status: "ready", ...truncateTo(parts.join("\n\n") || "(空表格)"), source: "excel" };
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
      // 图表理解：渲染前 N 页用 GLM-4V 逐页理解（扫描件/图表多的 PDF 也能拿到内容）
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
    if (ATTACHMENT_IMAGE_EXTENSIONS.has(ext)) {
      return await describeImage(filePath);
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
