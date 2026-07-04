/** Socratic Mentor 预承诺 — 问答类型 */

export interface SocraticQuestion {
  id: string;
  question: string;
  type: "single_choice" | "multi_choice" | "number" | "free_text";
  options?: string[];
  placeholder?: string;
  /** 映射到的维度 ID（用于 AI 翻译时关联） */
  relatedDimensions: string[];
}

export interface SocraticAnswer {
  questionId: string;
  question: string;
  answer: string;
}

/** 预定义的 6 个 Socratic 问题 */
export const SOCRATIC_QUESTIONS: SocraticQuestion[] = [
  {
    id: "q1",
    question: "你实验室这个方向通常投什么层次的期刊？",
    type: "single_choice",
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
    question: "在你的领域，一个实验最少需要多少次独立重复才能被视为可发表的数据？",
    type: "number",
    placeholder: "如 3",
    relatedDimensions: ["D4"],
  },
  {
    id: "q3",
    question: "你计划未来 2 年这个方向发表几篇论文？",
    type: "number",
    placeholder: "如 5",
    relatedDimensions: ["D5", "D6"],
  },
  {
    id: "q4",
    question: "哪些子方向是你的核心优势（有大量数据和发表积累）？",
    type: "free_text",
    placeholder: "如 热解机理、催化剂开发…",
    relatedDimensions: ["D1", "D2", "D7"],
  },
  {
    id: "q5",
    question: "你的实验室在这个方向上的独特优势是什么？",
    type: "multi_choice",
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
    id: "q6",
    question: "过去这个方向的论文被退稿的主要原因是什么？（可选，不填可跳过）",
    type: "free_text",
    placeholder: "如 数据量不足、创新性不够、方法描述不充分…",
    relatedDimensions: ["D4", "D7", "D2"],
  },
];
