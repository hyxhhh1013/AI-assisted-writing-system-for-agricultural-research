/**
 * 模板 section 声明 — 全项目单一数据源
 *
 * research 模式按期刊模板；review 模式使用固定五章结构（见 REVIEW_TEMPLATE_SECTIONS）。
 */

import type { ProjectWritingMode } from "@/contracts/writing-mode";

export interface TemplateSectionDef {
  /** section key（对应 project.sections[key]） */
  key: string;
  /** 渲染时的章节标签 */
  label: string;
  /** 章节编号（用于 "1 引言"、"2 材料与方法" 等） */
  sectionNumber: number;
  /**
   * 合并渲染的额外 key。
   * 如 GB/T 的 results 合并 discussion 内容：sections.results + sections.discussion 拼接渲染。
   * 渲染时 mergeKeys 的内容追加在主 key 内容之后。
   */
  mergeKeys?: string[];
  /** 是否跳过大标题渲染（如 Nature 的 Introduction 用 lead 样式） */
  skipHeading?: boolean;
}

export type TemplateId = "sci" | "ieee" | "gbt7713" | "nature" | "cas";

/** 各模板的 section 声明 */
export const TEMPLATE_SECTIONS: Record<TemplateId, TemplateSectionDef[]> = {
  gbt7713: [
    { key: "introduction", label: "引言", sectionNumber: 1 },
    { key: "methods", label: "材料与方法", sectionNumber: 2 },
    { key: "results", label: "结果与分析", sectionNumber: 3, mergeKeys: ["discussion"] },
    { key: "conclusion", label: "结论", sectionNumber: 4 },
  ],

  sci: [
    { key: "introduction", label: "Introduction", sectionNumber: 1 },
    { key: "methods", label: "Materials and Methods", sectionNumber: 2 },
    { key: "results", label: "Results and Discussion", sectionNumber: 3, mergeKeys: ["discussion"] },
    { key: "conclusion", label: "Conclusion", sectionNumber: 4 },
  ],

  ieee: [
    { key: "introduction", label: "Introduction", sectionNumber: 1 },
    { key: "methods", label: "Materials and Methods", sectionNumber: 2 },
    { key: "results", label: "Results", sectionNumber: 3 },
    { key: "conclusion", label: "Conclusion", sectionNumber: 4 },
  ],

  nature: [
    { key: "introduction", label: "Introduction", sectionNumber: 1, skipHeading: true },
    { key: "results", label: "Results", sectionNumber: 2 },
    { key: "methods", label: "Methods", sectionNumber: 3 },
    { key: "discussion", label: "Discussion", sectionNumber: 4 },
  ],

  cas: [
    { key: "introduction", label: "引言", sectionNumber: 1 },
    { key: "methods", label: "研究方法", sectionNumber: 2 },
    { key: "results", label: "结果与讨论", sectionNumber: 3, mergeKeys: ["discussion"] },
    { key: "conclusion", label: "结论", sectionNumber: 4 },
  ],
};

/** 综述模式固定章节（与 template 无关） */
export const REVIEW_TEMPLATE_SECTIONS: TemplateSectionDef[] = [
  { key: "introduction", label: "引言", sectionNumber: 1 },
  { key: "background", label: "研究现状与问题", sectionNumber: 2 },
  { key: "literature_body", label: "研究进展综述", sectionNumber: 3 },
  { key: "conclusion", label: "结论与展望", sectionNumber: 4 },
];

/**
 * 获取指定模板 + 写作模式的 section 列表。
 * review 模式忽略 template，使用 REVIEW_TEMPLATE_SECTIONS。
 */
export function getTemplateSections(
  template: string,
  mode?: ProjectWritingMode,
): TemplateSectionDef[] {
  if (mode === "review") return REVIEW_TEMPLATE_SECTIONS;
  return TEMPLATE_SECTIONS[template as TemplateId] || TEMPLATE_SECTIONS.sci;
}

/**
 * 获取模板中所有需要的 section key（含 mergeKeys）。
 * 用于判断哪些 section 需要生成内容。
 */
export function getAllSectionKeys(template: string, mode?: ProjectWritingMode): string[] {
  const sections = getTemplateSections(template, mode);
  const keys: string[] = [];
  for (const s of sections) {
    if (!keys.includes(s.key)) keys.push(s.key);
    if (s.mergeKeys) {
      for (const mk of s.mergeKeys) {
        if (!keys.includes(mk)) keys.push(mk);
      }
    }
  }
  return keys;
}

/**
 * 构建 section 下拉选项列表（用于 WritingPanel / Workbench）。
 * 仅返回主 key（不含 mergeKeys），因为 mergeKeys 的内容在主 key 中合并渲染。
 * 但如果模板独立使用某个 key（如 Nature 的 discussion），则单独列出。
 */
export function buildTemplateSectionOptions(
  template: string,
  mode?: ProjectWritingMode,
): { value: string; label: string }[] {
  const sections = getTemplateSections(template, mode);
  return sections.map((s) => ({ value: s.key, label: s.label }));
}

export function hasSeparateDiscussion(template: string, mode?: ProjectWritingMode): boolean {
  if (mode === "review") return false;
  const sections = getTemplateSections(template, mode);
  return sections.some(s => s.key === "discussion");
}

/**
 * 获取指定模板中某个 section 的编号。
 * 如 Nature 模板中 discussion 的 sectionNumber = 4。
 * 未找到时返回 undefined。
 */
export function getTemplateSectionNumber(
  template: string,
  sectionKey: string,
  mode?: ProjectWritingMode,
): number | undefined {
  const sections = getTemplateSections(template, mode);
  const def = sections.find(s => s.key === sectionKey);
  return def?.sectionNumber;
}
