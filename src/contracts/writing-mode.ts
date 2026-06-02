/** 写作模式 — 创建时选定，创建后不可在工作台切换 */

export type ProjectWritingMode = "review" | "research";

export interface WritingModeMeta {
  id: ProjectWritingMode;
  label: string;
  shortLabel: string;
  description: string;
  features: string[];
}

export const WRITING_MODES: Record<ProjectWritingMode, WritingModeMeta> = {
  review: {
    id: "review",
    label: "文献综述",
    shortLabel: "综述",
    description: "按主题梳理文献，适合研究进展、述评类文章",
    features: ["文献驱动扩写", "主题分类结构", "无需实验数据"],
  },
  research: {
    id: "research",
    label: "研究论文（创新型）",
    shortLabel: "创新型",
    description: "IMRaD 结构，适合原创试验与数据分析论文",
    features: ["材料与方法 / 结果", "实验数据证据链", "引用与数据双重校验"],
  },
};

export function getWritingModeMeta(mode: ProjectWritingMode | undefined): WritingModeMeta {
  return WRITING_MODES[mode === "research" ? "research" : "review"];
}

export function getDefaultProjectTitle(mode: ProjectWritingMode): string {
  return mode === "research" ? "新研究论文" : "新文献综述";
}
