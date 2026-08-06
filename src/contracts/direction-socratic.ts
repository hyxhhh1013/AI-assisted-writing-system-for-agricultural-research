/** Socratic Mentor 预承诺 — 问答类型 v3（对齐 academic-paper Plan Mode） */

/** 问题类型 — 对齐 academic-paper Socratic Mentor 四类 */
export type SocraticQuestionType =
  | "clarifying"
  | "probing"
  | "structuring"
  | "challenging";

export interface SocraticQuestion {
  id: string;
  question: string;
  type: "single_choice" | "multi_choice" | "number" | "free_text";
  /** academic-paper Socratic 问题类型 */
  questionType: SocraticQuestionType;
  options?: string[];
  placeholder?: string;
  /** 映射到的维度 ID */
  relatedDimensions: string[];
}

export interface SocraticAnswer {
  questionId: string;
  question: string;
  answer: string;
}

export const SOCRATIC_QUESTION_TYPE_LABELS: Record<SocraticQuestionType, string> = {
  clarifying: "边界澄清",
  probing: "假设暴露",
  structuring: "结构梳理",
  challenging: "收敛挑战",
};

export const SOCRATIC_QUESTIONS: SocraticQuestion[] = [
  {
    id: "q1",
    question: "你实验室这个方向通常投什么层次的期刊？",
    type: "single_choice",
    questionType: "clarifying",
    options: [
      "Q1 区（IF > 8，如 CNS 子刊、Nature Communications）",
      "Q1-Q2 区（IF 4-8，如 Bioresource Technology、Fuel）",
      "Q2-Q3 区（IF 2-4）",
      "Q3-Q4 区（IF < 2）",
      "不限层次，有论文就发",
    ],
    relatedDimensions: ["D7", "D5"],
  },
  {
    id: "q2",
    question: "在你的领域，一个实验最少需要多少次独立重复才能被视为可发表？",
    type: "number",
    questionType: "structuring",
    placeholder: "如 3",
    relatedDimensions: ["D4"],
  },
  {
    id: "q3",
    question: "你通常用什么统计方法来验证实验结论？",
    type: "multi_choice",
    questionType: "structuring",
    options: [
      "t 检验 / ANOVA",
      "回归分析（线性 / 非线性）",
      "效应量 + 置信区间",
      "非参数检验",
      "多元统计分析（PCA / PLS）",
      "机器学习模型验证",
    ],
    relatedDimensions: ["D4"],
  },
  {
    id: "q4",
    question: "你计划未来 2 年这个方向发表几篇论文？",
    type: "number",
    questionType: "clarifying",
    placeholder: "如 5",
    relatedDimensions: ["D5", "D6"],
  },
  {
    id: "q5",
    question: "哪些子方向是你的核心优势（已有大量数据和发表积累）？",
    type: "free_text",
    questionType: "structuring",
    placeholder: "如 热解机理、催化剂开发 → 分析时会优先识别这些方向的论文机会",
    relatedDimensions: ["D1", "D2", "D7"],
  },
  {
    id: "q6",
    question: "你的实验室在这个方向上最擅长的实验方法或表征技术是什么？",
    type: "free_text",
    questionType: "structuring",
    placeholder: "如 TG-FTIR 联用、GC-MS 产物分析、SEM/TEM 形貌表征、XRD 物相分析…",
    relatedDimensions: ["D1", "D6", "D7"],
  },
  {
    id: "q7",
    question: "你的实验室优势主要来自哪些方面？",
    type: "multi_choice",
    questionType: "probing",
    options: [
      "数据积累深度（多年连续实验数据）",
      "方法独特性（自研方法或专利技术）",
      "设备领先（独有或高端仪器设备）",
      "交叉学科视角（多学科方法融合）",
      "产业合作（与企业有紧密合作和数据共享）",
    ],
    relatedDimensions: ["D7", "D1"],
  },
  {
    id: "q8",
    question: "过去这个方向的论文被退稿的主要原因是什么？",
    type: "multi_choice",
    questionType: "probing",
    options: [
      "数据量 / 样本量不足",
      "创新性不够（与已有文献重叠过多）",
      "方法描述不充分，审稿人质疑可重复性",
      "统计分析方法不当",
      "英文写作质量问题",
      "投错期刊（不符合期刊 scope）",
    ],
    relatedDimensions: ["D4", "D7", "D2"],
  },
  {
    id: "q9",
    question: "你的实验数据是否存在以下限制？（可多选）",
    type: "multi_choice",
    questionType: "probing",
    options: [
      "部分实验只有单次数据（未重复）",
      "某些条件下的数据缺失（如高温/高压段）",
      "对照实验不完整",
      "数据分散在不同设备/平台上",
      "原始数据部分丢失",
      "以上均无",
    ],
    relatedDimensions: ["D4", "D6"],
  },
  {
    id: "q10",
    question: "这个方向与其他研究方向之间是否存在方法、数据或设备的共享/协同？",
    type: "free_text",
    questionType: "challenging",
    placeholder: "如 热化学的热解设备可用于烟草的热解特性研究，数据可共享…（无则填 无）",
    relatedDimensions: ["D8"],
  },
];
