import type { PaperConfigurationRecord, PaperType } from "./types";
import { WORD_COUNT_DEFAULTS } from "./intake-steps";

const PAPER_TYPE_LABEL: Record<PaperType, string> = {
  imrad: "实验研究论文（IMRaD）",
  literature_review: "文献综述",
  theoretical: "理论分析",
  case_study: "案例研究",
  policy_brief: "政策简报",
  conference: "会议论文",
};

const CITATION_LABEL = {
  apa7: "APA 第 7 版",
  chicago: "Chicago 第 17 版",
  mla: "MLA 第 9 版",
  ieee: "IEEE",
  vancouver: "Vancouver",
} as const;

/** 字数是否明显过短（intake 校验） */
export function validateWordCount(paperType: PaperType, words: number): string | null {
  const suggested = WORD_COUNT_DEFAULTS[paperType];
  if (words < suggested * 0.4) {
    return `当前目标约 ${words} 词，对「${PAPER_TYPE_LABEL[paperType]}」可能偏短（常见约 ${suggested} 词）。建议调高或更换论文类型。`;
  }
  return null;
}

export function configToRows(config: Partial<PaperConfigurationRecord>): { label: string; value: string }[] {
  const materials = config.existingMaterials;
  const materialList = materials
    ? [
        materials.researchQuestion && "研究问题",
        materials.literature && "文献",
        materials.data && "数据",
        materials.draftSections && "草稿",
        materials.reviewerFeedback && "审稿意见",
        materials.styleGuide && "期刊模板",
      ]
        .filter(Boolean)
        .join("、") || "未勾选"
    : "—";

  const co = config.coAuthors;
  const coText = !co
    ? "—"
    : co.mode === "single"
      ? "独立作者"
      : `合作 ${co.count} 人；通讯作者：${co.correspondingAuthor || "待定"}；${co.notes || ""}`;

  const fund = config.funding;
  const fundText = !fund
    ? "—"
    : fund.funded
      ? `${fund.agency || "资助机构待填"} ${fund.grantNumber || ""}（${fund.role || "角色待填"}）；利益冲突：${fund.coi || "无"}`
      : `无资助；利益冲突：${fund.coi || "无"}`;

  return [
    { label: "主题", value: config.topic || "—" },
    { label: "研究问题", value: config.researchQuestion || "—" },
    { label: "论文类型", value: config.paperType ? PAPER_TYPE_LABEL[config.paperType] : "—" },
    { label: "学科", value: config.discipline || "—" },
    { label: "目标期刊", value: config.targetJournal || "General" },
    { label: "引用格式", value: config.citationFormat ? CITATION_LABEL[config.citationFormat] : "—" },
    { label: "导出格式", value: config.outputFormat || "—" },
    { label: "正文语言", value: config.bodyLanguage || "—" },
    { label: "摘要", value: config.abstractLanguage || "—" },
    { label: "目标字数", value: config.wordCountTarget ? `${config.wordCountTarget} 词` : "—" },
    { label: "已有材料", value: materialList },
    { label: "作者", value: coText },
    { label: "资助", value: fundText },
    { label: "文风样本", value: config.styleProfileAttached ? "有意向提供" : "无" },
    { label: "证据标准", value: config.domainEvidenceProfile || "unknown_user_defined" },
    {
      label: "引用核查",
      value: config.citationVerification === "strict" ? "严格拦截" : "只标记（默认）",
    },
    { label: "运行模式", value: config.operationalMode || "—" },
    { label: "备注", value: config.notes || "无" },
  ];
}
