export interface WritingRequest {
  title: string;
  section: string;
  context: string;
  language: "zh" | "en";
  template: string;
  existingReferences: string[];  // 修复：实际是数组，不是 string
  researchDirection?: string;
  retrievalMode?: "precise" | "balanced" | "extensive";
  mode?: "fast" | "full";
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
}

export interface WritingStreamResult {
  content: string;
  verification: string;
  references: string[];
  citationWarnings: { num: number; overlap: number; context: string }[];
}
