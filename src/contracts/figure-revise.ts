/**
 * Agent 配图「按意见改」表单契约（结构化改意图，替代 window.prompt）。
 */

export const FIGURE_REVISE_ASPECTS = [
  "nodes",
  "fork",
  "layout",
  "color",
  "arrows",
  "template",
] as const;

export type FigureReviseAspect = (typeof FIGURE_REVISE_ASPECTS)[number];

export const FIGURE_REVISE_ASPECT_LABELS: Record<FigureReviseAspect, string> = {
  nodes: "改节点文案",
  fork: "增加/调整分叉",
  layout: "版式（单栏↔多面板）",
  color: "配色 preset",
  arrows: "补箭头/边标签",
  template: "套用农科模板",
};

export const FIGURE_REVISE_TEMPLATES = [
  { id: "", label: "不指定" },
  { id: "pyrolysis_framework", label: "热解调控框架" },
  { id: "deoxygenation_paths", label: "脱氧多面板" },
  { id: "dual_site_catalyst", label: "双功能位协同" },
  { id: "multiproduct_carbon", label: "多产物联产" },
] as const;

export const FIGURE_REVISE_PRESETS = [
  { id: "", label: "不改配色" },
  { id: "nature", label: "nature" },
  { id: "agr_journal", label: "agr_journal" },
  { id: "print_bw", label: "print_bw" },
] as const;

/** 一键预设：点一下填好 aspects / template / 补充说明 */
export const FIGURE_REVISE_SHORTCUTS = [
  {
    id: "fork_merge",
    label: "加分叉汇合",
    aspects: ["fork", "arrows"] as FigureReviseAspect[],
    templateId: "",
    colorPreset: "",
    note: "酸位/金属位/孔结构分路径后再汇合到产物调控，避免单链过简",
  },
  {
    id: "tri_panel",
    label: "三面板",
    aspects: ["layout", "nodes"] as FigureReviseAspect[],
    templateId: "",
    colorPreset: "",
    note: "改为 mechanism_panel 三栏 a/b/c，每栏中文 steps≥2",
  },
  {
    id: "deox_template",
    label: "脱氧模板",
    aspects: ["template", "fork"] as FigureReviseAspect[],
    templateId: "deoxygenation_paths",
    colorPreset: "",
    note: "套用脱氧多面板模板，路径标签用中文",
  },
  {
    id: "dual_site",
    label: "双功能位",
    aspects: ["template", "nodes"] as FigureReviseAspect[],
    templateId: "dual_site_catalyst",
    colorPreset: "agr_journal",
    note: "金属-酸协同；节点文案学术化、去占位",
  },
  {
    id: "multiproduct",
    label: "多产物联产",
    aspects: ["template", "fork", "layout"] as FigureReviseAspect[],
    templateId: "multiproduct_carbon",
    colorPreset: "",
    note: "生物油/合成气/碳材料分叉调控后再汇合",
  },
] as const;

export interface FigureReviseFormValue {
  aspects: FigureReviseAspect[];
  templateId: string;
  colorPreset: string;
  /** 自由补充一句 */
  note: string;
}

export interface FigureReviseTarget {
  imageUrl: string;
  replaceImageUrl?: string;
  title?: string;
  sectionKey?: string;
  /** replaced | appended | undefined */
  insertMode?: string;
  plotHref?: string;
}

export function emptyFigureReviseForm(): FigureReviseFormValue {
  return {
    aspects: [],
    templateId: "",
    colorPreset: "",
    note: "",
  };
}
