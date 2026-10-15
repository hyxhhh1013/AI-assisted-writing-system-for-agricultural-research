import type { ProjectData } from "@/contracts/project";
import type { FixableReviewIssue, FixableReviewReport, ReviewDimension } from "@/contracts/review";
import {
  getProjectWritingMode,
  getSectionKeysForMode,
  getSectionLabelForMode,
} from "@/lib/section-registry";

export interface QualitySection {
  key: string;
  title: string;
  content: string;
  wordCount: number;
}

/** 从项目构建质量检测用章节列表（与审查模块一致） */
export function buildQualitySections(
  project: Pick<ProjectData, "abstract" | "sections" | "mode">,
): QualitySection[] {
  const mode = getProjectWritingMode(project.mode);
  const list: QualitySection[] = [];

  if (project.abstract?.trim()) {
    const content = project.abstract.trim();
    list.push({
      key: "abstract",
      title: getSectionLabelForMode("abstract", mode),
      content,
      wordCount: content.length,
    });
  }

  for (const key of getSectionKeysForMode(mode)) {
    if (key === "abstract") continue;
    const raw = project.sections?.[key];
    if (typeof raw === "string" && raw.trim()) {
      const content = raw.trim();
      list.push({
        key,
        title: getSectionLabelForMode(key, mode),
        content,
        wordCount: content.length,
      });
    }
  }

  return list;
}

/** 单章或全文拼接为查重输入 */
export function buildCheckContentFromSections(
  sections: QualitySection[],
  scope: "full" | string,
): string {
  if (scope === "full") {
    return sections.map((s) => `${s.title}：\n${s.content}`).join("\n\n");
  }
  const one = sections.find((s) => s.key === scope);
  if (!one) return sections.map((s) => `${s.title}：\n${s.content}`).join("\n\n");
  return `${one.title}：\n${one.content}`;
}

export function totalWordCount(sections: QualitySection[]): number {
  return sections.reduce((n, s) => n + s.wordCount, 0);
}

export interface SectionHitSummary {
  count: number;
  worst: "high" | "medium" | "low" | null;
}

const HIT_RISK_RANK = { high: 3, medium: 2, low: 1 } as const;

/**
 * 全文检测时，按章节切分统计字面命中。正文不是「标题：\n正文」拼出来的全文时返回 null，避免用错偏移。
 */
export function sectionHitCounts(
  sections: QualitySection[],
  content: string,
  matches: Array<{ sourceOffset?: number; matchType: string; riskLevel: "high" | "medium" | "low" }>,
): Record<string, SectionHitSummary> | null {
  if (sections.length === 0) return null;
  if (content !== buildCheckContentFromSections(sections, "full")) return null;

  const ranges: Array<{ key: string; start: number; end: number }> = [];
  let cursor = 0;
  sections.forEach((section, index) => {
    const block = `${section.title}：\n${section.content}`;
    ranges.push({ key: section.key, start: cursor, end: cursor + block.length });
    cursor += block.length;
    if (index < sections.length - 1) cursor += 2;
  });

  const counts: Record<string, SectionHitSummary> = {};
  for (const section of sections) counts[section.key] = { count: 0, worst: null };
  for (const match of matches) {
    if (match.matchType === "ai") continue;
    const offset = match.sourceOffset ?? -1;
    if (offset < 0) continue;
    const range = ranges.find((item) => offset >= item.start && offset < item.end);
    if (!range) continue;
    const row = counts[range.key];
    if (!row) continue;
    row.count += 1;
    if (!row.worst || HIT_RISK_RANK[match.riskLevel] > HIT_RISK_RANK[row.worst]) {
      row.worst = match.riskLevel;
    }
  }
  return counts;
}

export interface IssueSectionHint {
  location: string;
  originalText?: string;
}

/**
 * 把审查问题定位到章节：标题/key → 「第 N 节」序号 → 原文片段。
 * 匹配不到时返回 null（调用方再决定是否回退到第一章）。
 */
export function resolveIssueSectionKey(
  issue: IssueSectionHint,
  sections: Array<{ key: string; title: string; content: string }>,
): string | null {
  if (sections.length === 0) return null;

  const loc = issue.location.trim().toLowerCase();
  for (const s of sections) {
    if (loc.includes(s.key.toLowerCase()) || loc.includes(s.title.toLowerCase())) {
      return s.key;
    }
  }

  const ordinal = loc.match(/第\s*(\d+)\s*节/);
  if (ordinal) {
    const idx = Number(ordinal[1]) - 1;
    if (idx >= 0 && idx < sections.length) return sections[idx].key;
  }

  const needle = issue.originalText?.trim();
  if (needle && needle.length >= 6) {
    const snippet = needle.slice(0, 80);
    const hit = sections.find((s) => s.content.includes(snippet));
    if (hit) return hit.key;
  }

  return null;
}

export type ReviewIssueAnchor =
  | { sectionKey: string; placed: true; offset: number; length: number }
  | { sectionKey: string; placed: false };

const REVIEW_DIMENSIONS: ReviewDimension[] = ["academic", "argument", "structure", "integrity"];

function sectionKeyAtOffset(
  content: string,
  sections: Array<{ key: string; title: string; content: string }>,
  offset: number,
): string | null {
  let cursor = 0;
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    if (!section) continue;
    if (index > 0) cursor += 2;
    const block = `${section.title}：\n${section.content}`;
    const start = content.startsWith(block, cursor) ? cursor : content.indexOf(block, cursor);
    if (start < 0) continue;
    if (offset >= start && offset < start + block.length) return section.key;
    cursor = start + block.length;
  }
  return null;
}

/**
 * 把一条审查意见对到阅读桌左侧那篇正文上。
 * 原文至少 6 字且能在正文里找到时给出偏移；只知道章节则 placed 为 false；都没有则 null。
 */
export function locateReviewIssue(
  content: string,
  sections: Array<{ key: string; title: string; content: string }>,
  issue: { location?: string; originalText?: string },
): ReviewIssueAnchor | null {
  const needle = issue.originalText?.trim() ?? "";
  const snippet = needle.length >= 6 ? needle.slice(0, 80) : "";
  if (snippet) {
    const at = content.indexOf(snippet);
    if (at >= 0) {
      const sectionKey = sectionKeyAtOffset(content, sections, at)
        ?? resolveIssueSectionKey({ location: issue.location ?? "", originalText: snippet }, sections);
      if (sectionKey) {
        return { sectionKey, placed: true, offset: at, length: snippet.length };
      }
    }
  }

  const sectionKey = resolveIssueSectionKey(
    { location: issue.location ?? "", originalText: snippet || undefined },
    sections,
  );
  if (sectionKey) return { sectionKey, placed: false };
  return null;
}

export interface AnchoredReviewIssue {
  id: string;
  dimension: ReviewDimension;
  index: number;
  sectionKey: string | null;
  placed: boolean;
  offset?: number;
  length?: number;
  issue: FixableReviewIssue;
}

/** 把一份审查报告里的问题分成可涂色和未定位。 */
export function anchorReviewReport(
  content: string,
  sections: Array<{ key: string; title: string; content: string }>,
  report: FixableReviewReport,
): AnchoredReviewIssue[] {
  const anchored: AnchoredReviewIssue[] = [];
  for (const dimension of REVIEW_DIMENSIONS) {
    const issues = report.dimensions[dimension]?.issues ?? [];
    issues.forEach((issue, index) => {
      const hit = locateReviewIssue(content, sections, issue);
      anchored.push({
        id: issue.id,
        dimension,
        index,
        issue: issue as FixableReviewIssue,
        sectionKey: hit?.sectionKey ?? null,
        placed: Boolean(hit?.placed),
        offset: hit?.placed ? hit.offset : undefined,
        length: hit?.placed ? hit.length : undefined,
      });
    });
  }
  return anchored;
}
