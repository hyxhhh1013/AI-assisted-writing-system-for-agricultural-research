/**
 * 参考文献格式化 — 全项目单一数据源
 *
 * 替代 server-pdf.ts / references/route.ts / rag.ts 中三个分散的格式化函数。
 * 核心逻辑：先清洗 bib 字段（sanitizeBib），再按 GB/T 7714 格式输出。
 */

import type { BibEntry } from "@/lib/rag";
import { resolveBibEntry, cleanSourceName } from "@/lib/rag";

// ── 清洗 ────────────────────────────────────────────────────────────────────

/** 从可能被污染的 DOI 字符串中提取纯 DOI */
function cleanDoi(raw: string): string {
  if (!raw) return raw;
  // 标准 DOI：10.xxxx/... 到空格/中文/特殊字符为止
  const match = raw.match(/(10\.\d{4,}\/[^\s一-鿿"<>，。、；]+)/);
  return match ? match[1].replace(/[.,;]+$/, "") : raw.trim();
}

/** 从可能被污染的 title 中去除 URL/收稿日期/作者简介/摘要等垃圾 */
function cleanTitle(raw: string): string {
  if (!raw) return raw;
  let t = raw;
  t = t.replace(/https?:\/\/[^\s]+/g, "");
  t = t.replace(/收稿日期[：:][^\n。]*/g, "");
  t = t.replace(/录用日期[：:][^\n。]*/g, "");
  t = t.replace(/作者简介[：:][^\n。]*/g, "");
  t = t.replace(/基金项目[：:（(][^\n。]*/g, "");
  t = t.replace(/随着[^。]{15,}/g, "");
  t = t.replace(/以[^。]{5,}为代表的/g, "");
  t = t.replace(/[\s]+/g, " ").trim();
  // 如果清洗后只剩标点或太短，视为无效
  if (t.length < 2) return "";
  return t;
}

/** 清洗 bib 字段中的垃圾数据 */
export function sanitizeBib(bib: BibEntry["bib"] | undefined | null): BibEntry["bib"] | null {
  if (!bib) return null;

  const cleaned = { ...bib };

  // DOI 清洗
  if (cleaned.doi) {
    cleaned.doi = cleanDoi(cleaned.doi);
  }

  // Title 清洗
  if (cleaned.title) {
    cleaned.title = cleanTitle(cleaned.title);
  }

  // Authors 清洗：过滤掉 "CNKI" 等非作者占位符
  if (Array.isArray(cleaned.authors)) {
    cleaned.authors = cleaned.authors.filter(
      a => a && a !== "CNKI" && a !== "cnki" && a.length > 0
    );
    if (cleaned.authors.length === 0) cleaned.authors = undefined;
  }

  // FirstAuthor 清洗
  if (cleaned.firstAuthor === "CNKI" || cleaned.firstAuthor === "cnki") {
    cleaned.firstAuthor = undefined;
  }

  // Journal 清洗：限制长度（期刊名通常不超过 20 字）
  if (cleaned.journal && cleaned.journal.length > 30) {
    cleaned.journal = cleaned.journal.slice(0, 30).trim();
  }

  return cleaned;
}

// ── 格式化 ──────────────────────────────────────────────────────────────────

/** 判断 bib 是否包含足够的有效数据 */
function hasValidBib(bib: BibEntry["bib"] | null): boolean {
  if (!bib) return false;
  // 至少需要作者或期刊之一 + 年份
  const hasAuthor = !!(bib.firstAuthor && bib.firstAuthor !== "CNKI");
  const hasJournal = !!(bib.journal && bib.journal.length > 1);
  const hasYear = !!bib.year;
  return hasYear && (hasAuthor || hasJournal);
}

/** 从文件名中提取中文作者名（兜底方案） */
function extractAuthorFromFilename(filename: string): string {
  // 文件名格式常见两种：
  //   "标题_作者.pdf"（作者在末尾）
  //   "28-2024-董航-油茶壳...研究.pdf"（序号-年份-作者-标题，作者在年份后）
  const cleaned = filename.replace(/\.pdf$/i, "");
  const parts = cleaned.split(/[_\-]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return "";

  // 优先：年份后的第一个 2-5 字中文名（序号-年份-作者-标题 模式）
  let afterYear = false;
  for (const p of parts) {
    if (/^(19|20)\d{2}$/.test(p)) {
      afterYear = true;
      continue;
    }
    if (afterYear && /^[一-鿿]{2,5}$/.test(p)) return p;
  }
  // 兜底：最后一个 2-5 字中文名（标题_作者 模式）
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^[一-鿿]{2,5}$/.test(parts[i])) return parts[i];
  }
  return "";
}

/**
 * 统一的参考文献格式化函数。
 *
 * @param filename - 文件名（如 "生物质炭_邱良祝.pdf"）
 * @param options.style - "gbt7714" 用于导出/预览（默认），"rag" 用于 AI 上下文
 * @param options.pageStart - RAG 模式下的起始页码
 * @param options.pageEnd - RAG 模式下的结束页码
 */
export function formatReference(
  filename: string,
  options?: {
    style?: "gbt7714" | "rag";
    pageStart?: number;
    pageEnd?: number;
  }
): string {
  const style = options?.style || "gbt7714";
  const entry = resolveBibEntry(filename);
  const rawBib = entry?.bib;
  const bib = sanitizeBib(rawBib);
  const docTag = entry?.gbTag || "J";

  // ── 专利 ──
  if (entry?.documentType === "patent" || docTag === "P") {
    if (bib?.patentNumber) {
      const inventor = bib.inventors?.[0] || bib.applicant || "";
      if (style === "rag") {
        return `[P] 专利 ${bib.patentNumber}${inventor ? ` | ${inventor} 等` : ""}${bib.publicationDate ? ` (${bib.publicationDate})` : ""}`;
      }
      return `${inventor ? inventor + ". " : ""}专利 ${bib.patentNumber}[P]${bib.publicationDate ? `. ${bib.publicationDate}` : ""}`;
    }
  }

  // ── 书籍 ──
  if (entry?.documentType === "book" || docTag === "M") {
    if (bib?.firstAuthor || bib?.title) {
      const author = bib.firstAuthor || "佚名";
      const year = bib.year ? ` (${bib.year})` : "";
      const title = bib.title || "";
      const pub = bib.publisher || "";
      if (style === "rag") {
        return `[M] ${author}${year} ${title}${pub ? ` | ${pub}` : ""}`;
      }
      return `${author}. ${title}[M]${pub ? `. ${pub}` : ""}${year ? `, ${bib.year}` : ""}`;
    }
  }

  // ── 期刊论文（默认）──
  if (hasValidBib(bib)) {
    const author = bib!.firstAuthor!
      + (Array.isArray(bib!.authors) && bib!.authors.length > 1 ? " 等" : "");
    const title = bib!.title || "";
    const journal = bib!.journal || "";
    const year = bib!.year;
    const vol = bib!.volume || "";
    const issue = bib!.issue || "";
    const pages = bib!.pages || "";
    const doi = bib!.doi || "";

    if (style === "rag") {
      const pageStr = options?.pageStart != null
        ? ` | p. ${options.pageStart}${options.pageEnd && options.pageEnd !== options.pageStart ? `-${options.pageEnd}` : ""}`
        : "";
      return `[${docTag}] ${author} (${year}) ${title} | ${journal} | DOI: ${doi}${pageStr}`.replace(/ \| DOI: $/, "");
    }

    // GB/T 7714-2015：作者. 标题[文献类型]. 期刊, 年, 卷(期): 页码.
    let result = `${author}. `;
    if (title) result += `${title}[${docTag}]. `;
    else result += `[${docTag}]. `;
    if (journal) result += journal;
    if (year) result += `, ${year}`;
    if (vol) result += `, ${vol}`;
    if (issue) result += `(${issue})`;
    if (pages) result += `: ${pages}`;
    result += ".";
    if (doi) result += ` DOI: ${doi}.`;
    return result.trim();
  }

  // ── 兜底：从文件名提取 ──
  const fallbackAuthor = extractAuthorFromFilename(filename);
  const cleanedName = cleanSourceName(filename);
  const year = filename.match(/(19|20)\d{2}/)?.[0] ?? "";

  if (style === "rag") {
    const pageStr = options?.pageStart != null
      ? ` (p. ${options.pageStart}${options.pageEnd && options.pageEnd !== options.pageStart ? `-${options.pageEnd}` : ""})`
      : "";
    return `${cleanedName}${pageStr}`;
  }

  // GB/T 7714 兜底：优先「作者. 标题[J], 年份.」，去掉文件名里的序号/年份/作者
  if (fallbackAuthor) {
    let titlePart = cleanedName;
    if (year) titlePart = titlePart.replace(year, " ");
    titlePart = titlePart.replace(fallbackAuthor, " ");
    titlePart = titlePart.replace(/^\s*\d+\s*/, "").replace(/\s+/g, " ").trim();
    if (titlePart) {
      return `${fallbackAuthor}. ${titlePart}[${docTag}]${year ? `, ${year}` : ""}.`;
    }
  }
  return `${cleanedName}[${docTag}]`;
}

export { formatExternalLiteratureHit } from "@/lib/external-literature-format";
