/**
 * 文献类型注册表
 *
 * 每种类型定义：
 *   - id：唯一标识（写入 documentType 字段）
 *   - label：中文名称
 *   - gbTag：GB/T 7714 文献类型标识
 *   - detect：从文件名+首页文字判断是否属于此类型
 *   - extract：从 pdfDocument + 首页文字提取结构化元数据
 *
 * 新增类型：在 REGISTRY 数组末尾追加一项即可，其余代码无需改动。
 */

import {
  extractFromPdfInfo,
  extractFromFilename,
  extractFromFirstPage,
  mergeBibEntries,
} from "./extractors/journal.mjs";

import {
  extractPatentNumber,
  extractFromPatentFirstPage,
} from "./extractors/patent.mjs";

import { extractISBN, extractPublisherInfo } from "./extractors/book.mjs";

// ────────────────────────────────────────────────────────────────────────────
// 类型注册表
// ────────────────────────────────────────────────────────────────────────────

export const REGISTRY = [
  // ── 专利 ─────────────────────────────────────────────────────────────────
  {
    id: "patent",
    label: "专利",
    gbTag: "P",
    detect(filename, firstPageText) {
      const text = (filename + " " + (firstPageText || "")).slice(0, 500);
      return /\b(CN|US|EP|WO|JP|KR)\s*\d{6,}/i.test(text)
        || /专利|patent|权利要求|申请人|发明人/i.test(text);
    },
    async extract(pdfDocument, filename, firstPageText) {
      const fromPage = extractFromPatentFirstPage(firstPageText || "");
      const patentNo = extractPatentNumber(filename) || fromPage.patentNumber;
      return {
        patentNumber: patentNo || null,
        inventors: fromPage.inventors || null,
        applicant: fromPage.applicant || null,
        publicationDate: fromPage.publicationDate || null,
      };
    },
  },

  // ── 书籍/专著 ─────────────────────────────────────────────────────────────
  {
    id: "book",
    label: "书籍",
    gbTag: "M",
    detect(filename, firstPageText) {
      const text = (filename + " " + (firstPageText || "")).slice(0, 800);
      // ISBN 是最强信号
      return /ISBN/i.test(text)
        || /出版社|publisher|edition|第\d+版/i.test(text);
    },
    async extract(pdfDocument, filename, firstPageText) {
      const fromFilename = extractFromFilename(filename);
      const isbn = extractISBN(firstPageText || "");
      const pubInfo = extractPublisherInfo(firstPageText || "");
      return {
        isbn: isbn || null,
        publisher: pubInfo.publisher || null,
        year: pubInfo.year || fromFilename.year || null,
        firstAuthor: fromFilename.firstAuthor || null,
      };
    },
  },

  // ── 期刊论文（默认兜底，放最后）───────────────────────────────────────────
  {
    id: "journal",
    label: "期刊论文",
    gbTag: "J",
    detect() {
      return true; // 兜底：匹配所有其他类型
    },
    async extract(pdfDocument, filename, firstPageText) {
      const fromInfo = await extractFromPdfInfo(pdfDocument);
      const fromName = extractFromFilename(filename);
      const fromPage = extractFromFirstPage(firstPageText || "");
      return mergeBibEntries(fromInfo, fromPage, fromName);
    },
  },
];

// ────────────────────────────────────────────────────────────────────────────
// 公共 API
// ────────────────────────────────────────────────────────────────────────────

/**
 * 检测文件所属类型（按注册顺序，第一个 detect 返回 true 的类型优先）
 * @param {string} filename
 * @param {string} firstPageText
 * @returns {{ id, label, gbTag, extract }}
 */
export function detectDocType(filename, firstPageText) {
  for (const entry of REGISTRY) {
    if (entry.detect(filename, firstPageText)) return entry;
  }
  return REGISTRY[REGISTRY.length - 1]; // 兜底 journal
}

/**
 * 提取文献结构化元数据（包含类型检测）
 * @returns {{ documentType, gbTag, bib }}
 */
export async function extractDocMetadata(pdfDocument, filename, firstPageText) {
  const docType = detectDocType(filename, firstPageText);
  let bib = {};
  try {
    bib = await docType.extract(pdfDocument, filename, firstPageText);
  } catch (err) {
    // 提取失败不影响索引，graceful degrade
    console.warn(`  [meta] extraction failed for ${filename}:`, err.message);
  }
  // 过滤掉空值
  const cleanBib = Object.fromEntries(
    Object.entries(bib).filter(([, v]) => v != null && v !== "")
  );
  return { documentType: docType.id, gbTag: docType.gbTag, bib: cleanBib };
}
