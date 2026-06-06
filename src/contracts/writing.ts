/** 扩写草稿最低字数（ENG-PR-080） */
export const MIN_DRAFT_CHARS = 50;
export const MIN_DRAFT_CHARS_SHORT = 20;

const SHORT_DRAFT_SECTIONS = new Set(["abstract", "keywords"]);

export function getMinDraftChars(sectionKey: string): number {
  return SHORT_DRAFT_SECTIONS.has(sectionKey) ? MIN_DRAFT_CHARS_SHORT : MIN_DRAFT_CHARS;
}

const CONTEXT_PLACEHOLDERS: Record<string, string> = {
  abstract:
    "请简述研究背景、方法、主要结果与结论方向（至少 20 字）。AI 将据此扩写摘要，不会凭空编造数据。",
  keywords: "请列出 3～8 个核心关键词或短语（至少 20 字），说明本研究的主题范畴。",
  introduction:
    "请写出本节要回答的问题、研究背景要点或待论证的论点（至少 50 字）。避免只写章节标题。",
  literature_review:
    "请说明要综述的主题脉络、待对比的观点或文献分组思路（至少 50 字）。",
  methods:
    "请描述实验/调查设计、材料、主要步骤或统计方法要点（至少 50 字）。",
  results: "请列出本节要呈现的主要发现、数据趋势或图表要点（至少 50 字）。",
  discussion:
    "请写出对结果的解释方向、与已有研究的对比点或局限性（至少 50 字）。",
  conclusion: "请概括本章要强调的贡献、实践意义或后续工作（至少 50 字）。",
};

export function getWritingContextPlaceholder(sectionKey: string): string {
  return (
    CONTEXT_PLACEHOLDERS[sectionKey] ??
    "请描述你想在本节展开的思路、要点或段落骨架（至少 50 字）。AI 辅助扩写，不会替代你的学术判断。"
  );
}

export interface WritingRequest {
  title: string;
  section: string;
  context: string;
  language: "zh" | "en";
  template: string;
  existingReferences: string[];  // 修复：实际是数组，不是 string
  researchDirection?: string;
  retrievalMode?: "precise" | "balanced" | "extensive";
  mode?: "fast" | "full" | "audit_only" | "fix_only";
  subsectionTitle?: string;
  figureStart?: number;
  globalContext?: {
    abstract?: string;
    outline?: string;
    sectionPreviews?: Record<string, string>;
    analysisResults?: string[];
  };
  verificationFeedback?: string;
  /** 写作模式：review=综述 research=研究论文 */
  projectMode?: "review" | "research";
  /** 证据摘要文本（由 evidence-pack 生成） */
  evidenceSummary?: string;
  /** 数据证据声明列表（前端传入，服务端构建 EvidencePack） */
  dataClaims?: import("./data-source").EvidenceClaim[];
  /** 引用格式标准 */
  citationStyle?: "gbt7714" | "vancouver" | "apa7" | "ieee";
}

export interface WritingStreamResult {
  content: string;
  verification: string;
  references: string[];
  citationWarnings: { num: number; overlap: number; context: string }[];
}
