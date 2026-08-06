import type { PaperConfigRecord } from "@/contracts/paper-passport";
import { paperConfigToRecord } from "@/contracts/paper-passport";

/**
 * Phase 0 配置 — 问答步骤（非整表填写）
 * 主入口已迁到「新建项目」向导；此处供 Agent 补填/修改旧项目。
 */

export type ConfigQaField = keyof PaperConfigRecord;

export type ConfigQaStepKind = "text" | "choice";

export interface ConfigQaChoice {
  value: string;
  label: string;
}

export interface ConfigQaStep {
  id: ConfigQaField;
  kind: ConfigQaStepKind;
  question: string;
  hint?: string;
  placeholder?: string;
  optional?: boolean;
  choices?: ConfigQaChoice[];
}

export const CONFIG_QA_STEPS: ConfigQaStep[] = [
  {
    id: "agentEntryMode",
    kind: "choice",
    question: "写作入口更接近哪一种？（可之后再改）",
    hint: "对齐 academic-paper：全流程 / 已有大纲 / 已有数据",
    optional: true,
    choices: [
      { value: "full", label: "从零推进（配置→文献→大纲→分节写）" },
      { value: "outline_ready", label: "已有大纲（按大纲写，不主动重做结构）" },
      { value: "data_ready", label: "已有数据（先图表/结果，再方法与讨论）" },
    ],
  },
  {
    id: "paperTitle",
    kind: "text",
    question: "这篇论文的题目是什么？",
    hint: "可先写工作标题，之后还能改",
    placeholder: "例如：生物炭对土壤肥力的影响研究进展",
  },
  {
    id: "paperType",
    kind: "choice",
    question: "论文类型更接近哪一种？",
    choices: [
      { value: "research", label: "研究论文（有实验/数据）" },
      { value: "review", label: "综述（文献评述为主）" },
    ],
  },
  {
    id: "language",
    kind: "choice",
    question: "正文主要用哪种语言写？",
    choices: [
      { value: "zh", label: "中文" },
      { value: "en", label: "英文" },
    ],
  },
  {
    id: "citationStyle",
    kind: "choice",
    question: "参考文献用哪套引用格式？",
    choices: [
      { value: "gbt7714", label: "GB/T 7714（中文期刊常用）" },
      { value: "apa7", label: "APA 7.0" },
      { value: "vancouver", label: "Vancouver" },
      { value: "ieee", label: "IEEE" },
    ],
  },
  {
    id: "wordCount",
    kind: "choice",
    question: "目标篇幅大概多少？",
    choices: [
      { value: "4000-6000", label: "4,000–6,000 字" },
      { value: "6000-8000", label: "6,000–8,000 字" },
      { value: "8000-12000", label: "8,000–12,000 字" },
      { value: "12000-20000", label: "12,000–20,000 字" },
    ],
  },
  {
    id: "targetJournal",
    kind: "text",
    question: "有目标期刊吗？（没有可跳过）",
    hint: "例如期刊名或「未定」",
    placeholder: "可选",
    optional: true,
  },
];

export function defaultConfigQaAnswers(
  existing?: Partial<PaperConfigRecord> | null,
  projectTitle?: string,
): Partial<PaperConfigRecord> {
  return {
    agentEntryMode: existing?.agentEntryMode,
    paperTitle: existing?.paperTitle || projectTitle || "",
    paperType: existing?.paperType || "research",
    language: existing?.language || "zh",
    citationStyle: existing?.citationStyle || "gbt7714",
    wordCount: existing?.wordCount || "8000-12000",
    targetJournal: existing?.targetJournal || "",
  };
}

export function isConfigQaComplete(answers: Partial<PaperConfigRecord>): boolean {
  const title = answers.paperTitle?.trim() ?? "";
  return (
    title.length > 0
    && (answers.paperType === "research" || answers.paperType === "review")
    && (answers.language === "zh" || answers.language === "en")
    && Boolean(answers.citationStyle)
    && Boolean(answers.wordCount)
  );
}

/** 项目是否已有「可继续写作」的完整配置（空壳 config 不算） */
export function hasCompletePaperConfig(config: unknown): boolean {
  if (!config || typeof config !== "object") return false;
  return isConfigQaComplete(config as Partial<PaperConfigRecord>);
}

export function toPaperConfigRecord(
  answers: Partial<PaperConfigRecord>,
): PaperConfigRecord | null {
  if (!isConfigQaComplete(answers)) return null;
  return paperConfigToRecord({
    paperTitle: answers.paperTitle!.trim(),
    paperType: answers.paperType as PaperConfigRecord["paperType"],
    language: answers.language as PaperConfigRecord["language"],
    citationStyle: answers.citationStyle as PaperConfigRecord["citationStyle"],
    wordCount: answers.wordCount || "8000-12000",
    targetJournal: (answers.targetJournal ?? "").trim(),
    ...(answers.agentEntryMode
      ? { agentEntryMode: answers.agentEntryMode }
      : {}),
  });
}

export function formatConfigQaSummary(cfg: PaperConfigRecord): string {
  const typeLabel = cfg.paperType === "research" ? "研究论文" : "综述";
  const lang = cfg.language === "en" ? "英文" : "中文";
  const journal = cfg.targetJournal || "未定刊";
  const entry =
    cfg.agentEntryMode === "outline_ready"
      ? "已有大纲"
      : cfg.agentEntryMode === "data_ready"
        ? "已有数据"
        : cfg.agentEntryMode === "full"
          ? "从零推进"
          : null;
  const base = `${cfg.paperTitle} · ${typeLabel} · ${lang} · ${cfg.citationStyle} · ${cfg.wordCount} · ${journal}`;
  return entry ? `${base} · ${entry}` : base;
}
