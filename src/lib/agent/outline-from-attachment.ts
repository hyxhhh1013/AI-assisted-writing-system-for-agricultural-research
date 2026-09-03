/**
 * 从会话附件提炼大纲骨架：文件名/正文启发式，不依赖模型自觉去 read_attachment。
 */

import { inferAttachmentKind } from "@/lib/agent/attachments/kind";

export const OUTLINE_FILENAME_RE =
  /大纲|提纲|框架|outline|skeleton|目录|framework|structure/i;

const MAX_HEADINGS = 18;
const MIN_HEADINGS = 3;
const FRAMEWORK_EXCERPT_CHARS = 6_000;
const SHORT_DOC_CHARS = 12_000;
const PAPER_CHARS = 15_000;

export interface OutlineAttachmentCandidate {
  id: string;
  originalName: string;
  extractedText: string;
  status: string;
}

export interface OutlineFramework {
  attachmentId: string;
  fileName: string;
  headings: string[];
  excerpt: string;
  source: "attachmentId" | "filename" | "content";
}

export type ResolveOutlineFrameworkResult =
  | { status: "used"; framework: OutlineFramework }
  | { status: "none" }
  | { status: "error"; error: string };

function stripHeadingDecor(raw: string): string {
  return raw
    .replace(/[#*_`]+/g, "")
    .replace(/^[（(]?\d{1,2}[）).、．]\s*/, "")
    .replace(/^[（(]?[一二三四五六七八九十]+[）)、.．]\s*/, "")
    .replace(/^第[一二三四五六七八九十\d]+[章节部分]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 只抽一级标题：Markdown #/##、1./一、/第一章；跳过 1.1 这类子节 */
export function extractOutlineHeadings(text: string): string[] {
  const headings: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.length > 80) continue;
    if (/^\d{1,2}\.\d+/.test(line)) continue;

    let title: string | null = null;
    const md = line.match(/^##\s+(?!#)(.+)$/);
    if (md) {
      title = stripHeadingDecor(md[1]);
    } else {
      const chapter = line.match(/^第[一二三四五六七八九十\d]+[章节部分]\s*(.*)$/);
      const cn = line.match(/^[（(]?[一二三四五六七八九十]+[）)、.．]\s*(.+)$/);
      const numbered = line.match(/^(\d{1,2})[\.、．)）]\s+(.+)$/)
        ?? line.match(/^(\d{1,2})\s+([^\d.].+)$/);
      if (chapter) title = stripHeadingDecor(chapter[1] || chapter[0]);
      else if (cn) title = stripHeadingDecor(cn[2] ?? cn[1]);
      else if (numbered) title = stripHeadingDecor(numbered[2]);
    }

    if (!title || title.length < 2 || title.length > 40) continue;
    const key = title.replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    headings.push(title);
    if (headings.length >= MAX_HEADINGS) break;
  }
  return headings;
}

export function looksLikeFullPaper(text: string): boolean {
  if (text.length < PAPER_CHARS) return false;
  return /参考文献|References|doi\.org|Abstract\s*\n|DOI:/i.test(text);
}

export function isDocumentAttachmentName(fileName: string): boolean {
  return inferAttachmentKind(fileName) === "document";
}

function scoreCandidate(row: OutlineAttachmentCandidate): {
  score: number;
  headings: string[];
  source: OutlineFramework["source"];
} {
  const headings = extractOutlineHeadings(row.extractedText);
  const nameHit = OUTLINE_FILENAME_RE.test(row.originalName);
  let score = 0;
  let source: OutlineFramework["source"] = "content";
  if (nameHit) {
    score += 100;
    source = "filename";
  }
  if (headings.length >= MIN_HEADINGS && headings.length <= MAX_HEADINGS) {
    score += headings.length;
  }
  if (row.extractedText.length <= SHORT_DOC_CHARS) score += 20;
  if (!nameHit && looksLikeFullPaper(row.extractedText)) score -= 100;
  return { score, headings, source };
}

function toFramework(
  row: OutlineAttachmentCandidate,
  headings: string[],
  source: OutlineFramework["source"],
): OutlineFramework {
  const text = row.extractedText.trim();
  return {
    attachmentId: row.id,
    fileName: row.originalName,
    headings,
    excerpt: text.slice(0, FRAMEWORK_EXCERPT_CHARS),
    source,
  };
}

/**
 * 指定 attachmentId 则必须用该文件（未就绪报错，禁止静默落到默认骨架）。
 * 未指定则在就绪文档里挑最像大纲/框架的一份；长论文 PDF 不采用。
 */
export function resolveOutlineFramework(input: {
  attachmentId?: string;
  attachments: readonly OutlineAttachmentCandidate[];
}): ResolveOutlineFrameworkResult {
  const preferredId = input.attachmentId?.trim() ?? "";
  if (preferredId) {
    const row = input.attachments.find((a) => a.id === preferredId);
    if (!row) {
      return { status: "error", error: `附件 ${preferredId} 不存在或不属于当前会话/项目` };
    }
    if (row.status !== "ready" || !row.extractedText.trim()) {
      return {
        status: "error",
        error:
          row.status === "extracting"
            ? `附件「${row.originalName}」仍在提取，请稍后再生成大纲，不要改用默认骨架。`
            : `附件「${row.originalName}」未能提取文本，请换 md/docx/txt 或重新上传。`,
      };
    }
    return {
      status: "used",
      framework: toFramework(row, extractOutlineHeadings(row.extractedText), "attachmentId"),
    };
  }

  const readyDocs = input.attachments.filter(
    (a) =>
      a.status === "ready"
      && a.extractedText.trim().length > 0
      && isDocumentAttachmentName(a.originalName),
  );
  if (readyDocs.length === 0) return { status: "none" };

  let best: {
    row: OutlineAttachmentCandidate;
    score: number;
    headings: string[];
    source: OutlineFramework["source"];
  } | null = null;
  for (const row of readyDocs) {
    const ranked = scoreCandidate(row);
    if (!best || ranked.score > best.score) {
      best = { row, ...ranked };
    }
  }
  if (!best) return { status: "none" };
  const nameHit = best.source === "filename";
  const usable =
    nameHit
    || (best.score >= 13 && best.headings.length >= MIN_HEADINGS && !looksLikeFullPaper(best.row.extractedText));
  if (!usable) return { status: "none" };
  return { status: "used", framework: toFramework(best.row, best.headings, best.source) };
}

export function parseUserSkeletonLines(raw: string | undefined): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** 附件抽出 ≥3 个一级标题则锁骨架；否则退回用户传入骨架 / 调用方默认。 */
export function pickOutlineSkeleton(input: {
  framework: OutlineFramework | null;
  paramSkeleton: string[];
  defaultSkeleton: string[];
}): { skeleton: string[]; lockedByAttachment: boolean } {
  if (input.framework && input.framework.headings.length >= MIN_HEADINGS) {
    return { skeleton: input.framework.headings, lockedByAttachment: true };
  }
  if (input.paramSkeleton.length >= MIN_HEADINGS) {
    return { skeleton: input.paramSkeleton, lockedByAttachment: false };
  }
  return { skeleton: input.defaultSkeleton, lockedByAttachment: false };
}

export function buildFrameworkPromptBlock(framework: OutlineFramework): string {
  return [
    `【用户上传的大纲/框架附件：${framework.fileName}】—— 必须作为底稿，禁止另起炉灶：`,
    "- 一级标题必须沿用附件（或下列骨架），不得换成默认综述/IMRaD 章节名",
    "- 附件里已有的二级标题尽量保留，只补缺、润色要点",
    "- 不得按模式默认骨架重写结构",
    "",
    framework.excerpt,
  ].join("\n");
}
