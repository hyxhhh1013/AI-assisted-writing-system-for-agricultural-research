/** IMRaD 章节常量 — 全项目单一数据源 */

export const IMRAD_SECTION_KEYS = ["abstract", "introduction", "methods", "results", "conclusion"] as const;
export type SectionKey = (typeof IMRAD_SECTION_KEYS)[number];

export const IMRAD_BODY_KEYS = ["introduction", "methods", "results", "conclusion"] as const;
export type BodySectionKey = (typeof IMRAD_BODY_KEYS)[number];

export const IMRAD_LABELS_ZH: Record<SectionKey, string> = {
  abstract: "摘要 (Abstract)",
  introduction: "引言 (Introduction)",
  methods: "材料与方法 (Methods)",
  results: "结果与讨论 (Results & Discussion)",
  conclusion: "结论 (Conclusion)",
};

export const IMRAD_LABELS_SHORT_ZH: Record<SectionKey, string> = {
  abstract: "摘要",
  introduction: "引言",
  methods: "材料与方法",
  results: "结果与讨论",
  conclusion: "结论",
};

export const IMRAD_LABELS_EN: Record<SectionKey, string> = {
  abstract: "Abstract",
  introduction: "Introduction",
  methods: "Materials and Methods",
  results: "Results and Discussion",
  conclusion: "Conclusion",
};

/** discussion 的标签（模板驱动，不在默认 section 列表中） */
export const DISCUSSION_LABELS = {
  zh: "讨论 (Discussion)",
  zhShort: "讨论",
  en: "Discussion",
} as const;

/** 章节排序索引 */
export const IMRAD_ORDER: Record<SectionKey, number> = {
  abstract: 0,
  introduction: 1,
  methods: 2,
  results: 3,
  conclusion: 4,
};

/** 章节编号（引言=1，方法=2…） */
export const IMRAD_SECTION_NUMBER: Record<SectionKey, number> = {
  abstract: 0,
  introduction: 1,
  methods: 2,
  results: 3,
  conclusion: 4,
};

export function getSectionLabel(key: SectionKey, lang: "zh" | "en" = "zh"): string {
  return lang === "zh" ? IMRAD_LABELS_ZH[key] : IMRAD_LABELS_EN[key];
}

export function getSectionLabelShort(key: SectionKey, lang: "zh" | "en" = "zh"): string {
  return lang === "zh" ? IMRAD_LABELS_SHORT_ZH[key] : IMRAD_LABELS_EN[key];
}

/** 构建 UI 下拉选项（替代各文件散落的 SECTIONS / DEFAULT_SECTIONS 数组） */
export function buildSectionOptions(lang: "zh" | "en" = "zh") {
  return IMRAD_SECTION_KEYS.map((key) => ({
    value: key,
    label: getSectionLabel(key, lang),
  }));
}

/** 构建工作台编辑器选项（带 id + placeholder + 编号前缀） */
export function buildWorkbenchSections(lang: "zh" | "en" = "zh") {
  const isZh = lang === "zh";
  return IMRAD_SECTION_KEYS.map((key) => {
    const num = IMRAD_ORDER[key];
    let label: string;
    let placeholder: string;
    if (key === "abstract") {
      label = isZh ? "Abstract" : "Abstract";
      placeholder = isZh ? "摘要内容…" : "Abstract content…";
    } else {
      label = `${num}. ${getSectionLabel(key, lang)}`;
      placeholder = isZh
        ? ({ introduction: "引言部分…", methods: "材料与方法…", results: "结果与讨论…", conclusion: "结论部分…" } as Record<string, string>)[key] ?? ""
        : ({ introduction: "Introduction…", methods: "Materials and Methods…", results: "Results and Discussion…", conclusion: "Conclusion…" } as Record<string, string>)[key] ?? "";
    }
    return { id: key, label, placeholder };
  });
}
