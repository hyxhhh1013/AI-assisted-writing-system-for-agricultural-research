/**
 * 写作模式 → 章节注册表（单一入口）
 * research → imrad.ts；review → review-structure.ts
 */

import type { ProjectWritingMode } from "@/contracts/writing-mode";
import {
  IMRAD_SECTION_KEYS,
  IMRAD_ORDER,
  IMRAD_SECTION_NUMBER,
  getSectionLabel,
  buildWorkbenchSections as buildImradWorkbenchSections,
} from "@/lib/imrad";
import {
  REVIEW_SECTION_KEYS,
  REVIEW_ORDER,
  REVIEW_SECTION_NUMBER,
  getReviewSectionLabel,
  buildReviewWorkbenchSections,
  isReviewSectionKey,
} from "@/lib/review-structure";

export type AnySectionKey = string;

// discussion 在 Nature 等模板中为独立章节，需在研究模式下可用
const RESEARCH_KEYS = new Set<string>([...IMRAD_SECTION_KEYS, "discussion"]);
const REVIEW_KEYS = new Set<string>(REVIEW_SECTION_KEYS);

export function getProjectWritingMode(mode: ProjectWritingMode | undefined): ProjectWritingMode {
  return mode === "research" ? "research" : "review";
}

export function getSectionKeysForMode(mode: ProjectWritingMode | undefined): readonly string[] {
  return getProjectWritingMode(mode) === "research" ? IMRAD_SECTION_KEYS : REVIEW_SECTION_KEYS;
}

/**
 * 扩写面板推荐顺序：正文先写，摘要最后写（摘要需注入全文）。
 */
export function getWritingSectionKeysForMode(mode: ProjectWritingMode | undefined): readonly string[] {
  const keys = getSectionKeysForMode(mode);
  const body = keys.filter((k) => k !== "abstract");
  return keys.includes("abstract") ? [...body, "abstract"] : keys;
}

export function getCoreSectionKeysForMode(mode: ProjectWritingMode | undefined): readonly string[] {
  return getSectionKeysForMode(mode);
}

export function isSectionValidForMode(section: string, mode: ProjectWritingMode | undefined): boolean {
  const m = getProjectWritingMode(mode);
  if (m === "research") return RESEARCH_KEYS.has(section);
  return REVIEW_KEYS.has(section);
}

export function getSectionOrderForMode(section: string, mode: ProjectWritingMode | undefined): number {
  const m = getProjectWritingMode(mode);
  if (m === "research" && RESEARCH_KEYS.has(section)) {
    if (section === "discussion") return 4;
    return IMRAD_ORDER[section as keyof typeof IMRAD_ORDER];
  }
  if (m === "review" && isReviewSectionKey(section)) {
    return REVIEW_ORDER[section];
  }
  return 99;
}

export function getSectionNumberForMode(
  section: string,
  mode: ProjectWritingMode | undefined,
): number | undefined {
  const m = getProjectWritingMode(mode);
  if (m === "research" && RESEARCH_KEYS.has(section)) {
    if (section === "discussion") return 4;
    return IMRAD_SECTION_NUMBER[section as keyof typeof IMRAD_SECTION_NUMBER];
  }
  if (m === "review" && isReviewSectionKey(section)) {
    return REVIEW_SECTION_NUMBER[section];
  }
  return undefined;
}

export function getSectionLabelForMode(
  section: string,
  mode: ProjectWritingMode | undefined,
  lang: "zh" | "en" = "zh",
): string {
  const m = getProjectWritingMode(mode);
  if (m === "research" && RESEARCH_KEYS.has(section)) {
    if (section === "discussion") return lang === "zh" ? "讨论 (Discussion)" : "Discussion";
    return getSectionLabel(section as keyof typeof IMRAD_ORDER, lang);
  }
  if (m === "review" && isReviewSectionKey(section)) {
    return getReviewSectionLabel(section, lang);
  }
  return section;
}

export function buildWorkbenchSectionsForMode(mode: ProjectWritingMode | undefined, lang: "zh" | "en" = "zh") {
  return getProjectWritingMode(mode) === "research"
    ? buildImradWorkbenchSections(lang)
    : buildReviewWorkbenchSections(lang);
}

export function buildSectionOptionsForMode(mode: ProjectWritingMode | undefined, lang: "zh" | "en" = "zh") {
  return getWritingSectionKeysForMode(mode).map((key) => ({
    value: key,
    label:
      key === "abstract"
        ? `${getSectionLabelForMode(key, mode, lang)}（建议最后写）`
        : getSectionLabelForMode(key, mode, lang),
  }));
}
