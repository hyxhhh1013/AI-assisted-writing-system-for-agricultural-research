/** 综述模式章节 — @review-only；research 仍用 imrad.ts */

import type { ProjectWritingMode } from "@/contracts/writing-mode";

export const REVIEW_SECTION_KEYS = [
  "abstract",
  "introduction",
  "background",
  "literature_body",
  "conclusion",
] as const;

export type ReviewSectionKey = (typeof REVIEW_SECTION_KEYS)[number];

export const REVIEW_BODY_KEYS = [
  "introduction",
  "background",
  "literature_body",
  "conclusion",
] as const;

export const REVIEW_LABELS_ZH: Record<ReviewSectionKey, string> = {
  abstract: "摘要 (Abstract)",
  introduction: "引言 (Introduction)",
  background: "研究现状与问题 (Background)",
  literature_body: "研究进展综述 (Literature Review)",
  conclusion: "结论与展望 (Conclusion)",
};

export const REVIEW_LABELS_SHORT_ZH: Record<ReviewSectionKey, string> = {
  abstract: "摘要",
  introduction: "引言",
  background: "研究现状",
  literature_body: "进展综述",
  conclusion: "结论与展望",
};

export const REVIEW_LABELS_EN: Record<ReviewSectionKey, string> = {
  abstract: "Abstract",
  introduction: "Introduction",
  background: "Background and Current Issues",
  literature_body: "Literature Review",
  conclusion: "Conclusion and Outlook",
};

export const REVIEW_ORDER: Record<ReviewSectionKey, number> = {
  abstract: 0,
  introduction: 1,
  background: 2,
  literature_body: 3,
  conclusion: 4,
};

export const REVIEW_SECTION_NUMBER: Record<ReviewSectionKey, number> = {
  abstract: 0,
  introduction: 1,
  background: 2,
  literature_body: 3,
  conclusion: 4,
};

export function isReviewSectionKey(key: string): key is ReviewSectionKey {
  return (REVIEW_SECTION_KEYS as readonly string[]).includes(key);
}

export function getReviewSectionLabel(key: ReviewSectionKey, lang: "zh" | "en" = "zh"): string {
  return lang === "zh" ? REVIEW_LABELS_ZH[key] : REVIEW_LABELS_EN[key];
}

export function buildReviewWorkbenchSections(lang: "zh" | "en" = "zh") {
  const isZh = lang === "zh";
  return REVIEW_SECTION_KEYS.map((key) => {
    const num = REVIEW_ORDER[key];
    const placeholdersZh: Partial<Record<ReviewSectionKey, string>> = {
      introduction: "综述目的与文章结构…",
      background: "领域现状、分布与主要问题…",
      literature_body: "按主题分类的文献综合…",
      conclusion: "综合判断、研究空白与展望…",
    };
    const placeholdersEn: Partial<Record<ReviewSectionKey, string>> = {
      introduction: "Scope and organization of this review…",
      background: "Field status and key problems…",
      literature_body: "Thematic synthesis of literature…",
      conclusion: "Synthesis, gaps, and future directions…",
    };
    if (key === "abstract") {
      return {
        id: key,
        label: isZh ? "Abstract" : "Abstract",
        placeholder: isZh ? "摘要内容…" : "Abstract content…",
      };
    }
    return {
      id: key,
      label: `${num}. ${getReviewSectionLabel(key, lang)}`,
      placeholder: isZh
        ? (placeholdersZh[key] ?? "")
        : (placeholdersEn[key] ?? ""),
    };
  });
}

/** 列表进度计算用 */
export function getReviewCoreSectionKeys(): readonly string[] {
  return REVIEW_SECTION_KEYS;
}

export function assertReviewMode(mode: ProjectWritingMode | undefined): void {
  if (mode === "research") {
    throw new Error("Review structure used in research mode");
  }
}
