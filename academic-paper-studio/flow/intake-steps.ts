/**
 * Phase 0 配置访谈步骤 — 对齐 intake_agent.md Step 1–13
 * plan 模式仅用 PLAN_INTAKE_STEPS（3 问）
 */

import type { PaperType } from "./types";

export interface IntakeOption {
  value: string;
  label: string;
  hint?: string;
}

export interface IntakeStep {
  id: string;
  stepNumber: number;
  title: string;
  question: string;
  help: string;
  field:
    | "topic"
    | "researchQuestion"
    | "paperType"
    | "targetJournal"
    | "citationFormat"
    | "outputFormat"
    | "bodyLanguage"
    | "abstractLanguage"
    | "wordCountTarget"
    | "existingMaterials"
    | "coAuthors"
    | "styleProfileAttached"
    | "funding"
    | "domainEvidenceProfile"
    | "citationVerification"
    | "discipline";
  kind: "text" | "textarea" | "single" | "multi" | "number" | "composite";
  options?: IntakeOption[];
  optional?: boolean;
}

export const PAPER_TYPE_OPTIONS: IntakeOption[] = [
  { value: "imrad", label: "实验研究论文（IMRaD）", hint: "有数据/结果，约 5000–8000 词" },
  { value: "literature_review", label: "文献综述", hint: "综合已有研究，约 6000–10000 词" },
  { value: "theoretical", label: "理论分析", hint: "构建或分析理论框架，约 5000–8000 词" },
  { value: "case_study", label: "案例研究", hint: "深入分析具体案例，约 4000–7000 词" },
  { value: "policy_brief", label: "政策简报", hint: "基于证据的政策建议，约 2000–4000 词" },
  { value: "conference", label: "会议论文", hint: "精炼展示研究成果，约 2000–5000 词" },
];

export const WORD_COUNT_DEFAULTS: Record<PaperType, number> = {
  imrad: 6000,
  literature_review: 8000,
  theoretical: 6000,
  case_study: 5500,
  policy_brief: 3000,
  conference: 3500,
};

export const FULL_INTAKE_STEPS: IntakeStep[] = [
  {
    id: "topic",
    stepNumber: 1,
    title: "题目与研究问题",
    question: "你这篇论文想研究什么？用一两句话写清楚即可。",
    help: "如果还比较模糊，先写主题；下一步可以一起收成可研究的问题。",
    field: "topic",
    kind: "textarea",
  },
  {
    id: "rq",
    stepNumber: 1,
    title: "研究问题（可细化）",
    question: "如果已有明确的研究问题，请写在这里；没有可先跳过。",
    help: "好的研究问题通常具体、可验证，例如「某处理对某指标的影响是什么」。",
    field: "researchQuestion",
    kind: "textarea",
    optional: true,
  },
  {
    id: "discipline",
    stepNumber: 1,
    title: "学科方向",
    question: "你的学科 / 细分方向是？",
    help: "例如：农业工程、茶叶加工、环境科学、土壤学……",
    field: "discipline",
    kind: "text",
  },
  {
    id: "paperType",
    stepNumber: 2,
    title: "论文类型",
    question: "这篇论文更接近哪一种？",
    help: "不确定时，有实验数据选「实验研究」；主要梳理文献选「文献综述」。",
    field: "paperType",
    kind: "single",
    options: PAPER_TYPE_OPTIONS,
  },
  {
    id: "journal",
    stepNumber: 3,
    title: "目标期刊（可选）",
    question: "有目标期刊吗？没有就填「暂无」或留空。",
    help: "有期刊时，后面排版会尽量按该刊习惯准备。",
    field: "targetJournal",
    kind: "text",
    optional: true,
  },
  {
    id: "citation",
    stepNumber: 4,
    title: "引用格式",
    question: "正文文献引用用哪种格式？",
    help: "农学/社科常用 APA；医学常用 Vancouver；工程常用 IEEE。不确定可选 APA。",
    field: "citationFormat",
    kind: "single",
    options: [
      { value: "apa7", label: "APA 第 7 版", hint: "教育、心理、社科常用" },
      { value: "chicago", label: "Chicago 第 17 版", hint: "历史、人文" },
      { value: "mla", label: "MLA 第 9 版", hint: "文学、语言" },
      { value: "ieee", label: "IEEE", hint: "工程、计算机" },
      { value: "vancouver", label: "Vancouver", hint: "医学、生物医学" },
    ],
  },
  {
    id: "output",
    stepNumber: 5,
    title: "导出格式",
    question: "最后希望拿到什么格式的文稿？",
    help: "日常写作用 Markdown 最方便；交 Word 给导师选 DOCX；投部分期刊可能要 LaTeX。",
    field: "outputFormat",
    kind: "single",
    options: [
      { value: "markdown", label: "Markdown（推荐起步）" },
      { value: "docx", label: "Word（DOCX）" },
      { value: "latex", label: "LaTeX" },
      { value: "pdf", label: "PDF" },
      { value: "combined", label: "以上都要" },
    ],
  },
  {
    id: "language",
    stepNumber: 6,
    title: "正文语言",
    question: "正文主要用哪种语言写？",
    help: "实验室常见：中文正文 + 英文摘要，或全英文稿。",
    field: "bodyLanguage",
    kind: "single",
    options: [
      { value: "zh-TW", label: "中文" },
      { value: "en", label: "英文" },
      { value: "bilingual", label: "中英双语章节" },
    ],
  },
  {
    id: "abstractLang",
    stepNumber: 6,
    title: "摘要语言",
    question: "摘要需要中英双语吗？",
    help: "默认建议双语：中英文各自独立撰写，不是机翻。",
    field: "abstractLanguage",
    kind: "single",
    options: [
      { value: "bilingual", label: "中英双语（推荐）" },
      { value: "en-only", label: "仅英文" },
      { value: "zh-TW-only", label: "仅中文" },
    ],
  },
  {
    id: "words",
    stepNumber: 7,
    title: "目标字数",
    question: "全文大概写多少词？（英文词数；中文可按相近篇幅理解）",
    help: "系统会按论文类型给建议值，你也可以改。太短会提示可能不够支撑该类型。",
    field: "wordCountTarget",
    kind: "number",
  },
  {
    id: "materials",
    stepNumber: 8,
    title: "已有材料",
    question: "你手头已经有哪些材料？（可多选）",
    help: "有什么勾什么，避免重复劳动；后面阶段会据此跳过或简化。",
    field: "existingMaterials",
    kind: "multi",
    options: [
      { value: "researchQuestion", label: "研究问题 / 中心论点" },
      { value: "literature", label: "文献 / 参考文献列表" },
      { value: "data", label: "实验数据 / 结果" },
      { value: "draftSections", label: "已有部分草稿" },
      { value: "reviewerFeedback", label: "审稿 / 导师意见" },
      { value: "styleGuide", label: "目标期刊模板或投稿须知" },
    ],
  },
  {
    id: "authors",
    stepNumber: 9,
    title: "作者情况",
    question: "是独立完成，还是有合作者？",
    help: "有合作者时，后期需要写作者贡献（CRediT）。现在先简单说明即可。",
    field: "coAuthors",
    kind: "composite",
  },
  {
    id: "style",
    stepNumber: 10,
    title: "文风校准（可选）",
    question: "要不要提供你过去的文章样本，让系统学习你的写法？",
    help: "可选。提供 3 篇以上更稳；学科规范始终优先于个人文风。",
    field: "styleProfileAttached",
    kind: "single",
    optional: true,
    options: [
      { value: "false", label: "暂不需要" },
      { value: "true", label: "之后上传样本（先记下意向）" },
    ],
  },
  {
    id: "funding",
    stepNumber: 11,
    title: "资助与利益冲突",
    question: "本研究是否有基金资助？是否有利益冲突需要声明？",
    help: "没有资助也要在论文里写明「无资助」；利益冲突默认可写「无」。",
    field: "funding",
    kind: "composite",
  },
  {
    id: "evidenceProfile",
    stepNumber: 12,
    title: "文献证据标准",
    question: "筛文献时，按哪类学科的证据习惯来？",
    help: "只影响「哪些类型证据可纳入」，不影响最终等级。不确定请选「通用/暂不确定」。",
    field: "domainEvidenceProfile",
    kind: "single",
    options: [
      {
        value: "unknown_user_defined",
        label: "通用 / 暂不确定（默认）",
        hint: "中性标准，适合大多数情况",
      },
      {
        value: "general_social_science",
        label: "社科实证",
        hint: "实证、混合方法、政策/专家证据",
      },
      {
        value: "cs_ml",
        label: "计算机 / 机器学习",
        hint: "可纳入预印本、会议论文",
      },
      {
        value: "humanities_interpretive",
        label: "人文学科诠释",
        hint: "可纳入原始/典籍文献；新旧不是质量信号",
      },
    ],
  },
  {
    id: "citeVerify",
    stepNumber: 13,
    title: "引用可核查级别",
    question: "遇到暂时查不到 DOI 的文献时，怎么处理？",
    help: "默认「只标记不拦截」更适合含标准、报告等灰色文献的领域。",
    field: "citationVerification",
    kind: "single",
    options: [
      {
        value: "advisory",
        label: "只标记（默认）",
        hint: "不可核查引用会加提示，但不阻止完成",
      },
      {
        value: "strict",
        label: "严格拦截",
        hint: "DOI/arXiv 明确查无则阻止定稿——适合 DOI 密集领域",
      },
    ],
  },
];

export const PLAN_INTAKE_STEPS: IntakeStep[] = [
  {
    id: "plan-topic",
    stepNumber: 1,
    title: "主题",
    question: "你想写的论文主题是什么？",
    help: "一句话即可，后面会用提问帮你收窄。",
    field: "topic",
    kind: "textarea",
  },
  {
    id: "plan-materials",
    stepNumber: 2,
    title: "已有材料",
    question: "你现在手里有什么？（文献、数据、想法都可以写）",
    help: "没有也没关系，写「几乎空白」即可。",
    field: "researchQuestion",
    kind: "textarea",
  },
  {
    id: "plan-structure",
    stepNumber: 3,
    title: "结构偏好",
    question: "更倾向哪种论文结构？",
    help: "不确定就选「还不确定」，导师模式会帮你选。",
    field: "paperType",
    kind: "single",
    options: [
      { value: "imrad", label: "IMRaD（实验论文常见结构）" },
      { value: "literature_review", label: "文献综述结构" },
      { value: "theoretical", label: "其他 / 理论型" },
      { value: "case_study", label: "还不确定" },
    ],
  },
];
