import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import papa from "papaparse";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { describeImage } from "@/lib/agent/attachments/describe-image";
import {
  ATTACHMENT_ALLOWED_EXTENSIONS,
  ATTACHMENT_IMAGE_EXTENSIONS,
  MAX_ATTACHMENT_TEXT_CHARS,
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
  if (text.length <= MAX_ATTACHMENT_TEXT_CHARS) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, MAX_ATTACHMENT_TEXT_CHARS), truncated: true };
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
  return [headLine, sepLine, ...bodyLines].join("\n");
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
      // pdf-parse v2 为类 API：new PDFParse({ data }) → getText()
      const parser = new PDFParse({ data: fs.readFileSync(filePath) });
      const result = await parser.getText();
      const text = (result.text ?? "").replace(/\n{3,}/g, "\n\n");
      return { status: "ready", ...truncateTo(text.trim() || "(PDF 无文本层)"), source: "pdf" };
    }
    if (ext === "docx") {
      const result = await mammoth.extractRawText({ path: filePath });
      return { status: "ready", ...truncateTo(result.value.trim()), source: "docx" };
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
