/** 扩写 UI 流程（ENG-PR-081） */
export type WritingFlowMode = "standard" | "preview" | "full";

/** 标准人控流程阶段 */
export type ManualWritingPhase = "idle" | "draft_ready" | "review_ready" | "done";

export function toApiWriteMode(flowMode: WritingFlowMode): "fast" | "full" {
  return flowMode === "full" ? "full" : "fast";
}

/** 扩写草稿最低字数（ENG-PR-080） */
export const MIN_DRAFT_CHARS = 50;
export const MIN_DRAFT_CHARS_SHORT = 20;

/** ENG-PR-096b：要点列表 */
export const MIN_WRITING_BULLETS = 3;
export const MAX_WRITING_BULLETS = 8;
export const MIN_BULLET_CHARS = 8;

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

/** 去除空项并截断上限 */
export function normalizeWritingBullets(bullets: string[] | undefined): string[] {
  if (!bullets?.length) return [];
  return bullets.map((b) => b.trim()).filter(Boolean).slice(0, MAX_WRITING_BULLETS);
}

export function formatWritingBulletsForPrompt(bullets: string[]): string {
  return normalizeWritingBullets(bullets)
    .map((b, i) => `${i + 1}. ${b}`)
    .join("\n");
}

/** 要点 + 可选补充说明 → RAG / 管道用统一上下文 */
export function resolveWritingDraftContext(context: string | undefined, bullets: string[] | undefined): string {
  const normalized = normalizeWritingBullets(bullets);
  const parts: string[] = [];
  if (normalized.length > 0) {
    parts.push(`【本节扩写要点】\n${formatWritingBulletsForPrompt(normalized)}`);
  }
  const extra = context?.trim();
  if (extra) parts.push(`【补充说明】\n${extra}`);
  return parts.join("\n\n");
}

export function isWritingDraftReady(
  context: string | undefined,
  bullets: string[] | undefined,
  sectionKey: string,
): boolean {
  const minDraft = getMinDraftChars(sectionKey);
  const normalized = normalizeWritingBullets(bullets);
  if (normalized.length >= MIN_WRITING_BULLETS) {
    const eachLongEnough = normalized.every((b) => b.length >= MIN_BULLET_CHARS);
    if (!eachLongEnough) return false;
    const totalChars = normalized.join("").length + (context?.trim().length ?? 0);
    // 3+ 条有效要点即满足「条数门槛」；否则与 legacy context 一样看总字数
    return totalChars >= minDraft || normalized.length >= MIN_WRITING_BULLETS;
  }
  return (context?.trim().length ?? 0) >= minDraft;
}

/** 从大纲/旧 context 文本拆成要点行（不足则补空行） */
export function contextLinesToBullets(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^[\d\-•*.、)）\]]+\s*/, "").trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return Array.from({ length: MIN_WRITING_BULLETS }, () => "");
  }
  const result = lines.slice(0, MAX_WRITING_BULLETS);
  while (result.length < MIN_WRITING_BULLETS) result.push("");
  return result;
}

/** 标准人控流程 + 有效要点 → 走 096c 逐条扩写，非整节一次 SSE */
export function shouldUseCollaborativeBulletExpand(
  flowMode: WritingFlowMode,
  bullets: string[] | undefined,
): boolean {
  return flowMode === "standard" && normalizeWritingBullets(bullets).length >= MIN_WRITING_BULLETS;
}

/** 合并已采纳草稿与当前要点段落 */
export function mergeWritingDraftParagraphs(existing: string, paragraph: string): string {
  const head = existing.trim();
  const tail = paragraph.trim();
  if (!head) return tail;
  if (!tail) return head;
  return `${head}\n\n${tail}`;
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
  mode?: "fast" | "full" | "audit_only" | "fix_only" | "expand_bullet";
  subsectionTitle?: string;
  figureStart?: number;
  globalContext?: {
    abstract?: string;
    outline?: string;
    sectionPreviews?: Record<string, string>;
    analysisResults?: string[];
    blueprint?: import("./writing-blueprint").WritingBlueprint | null;
    argumentBlueprint?: import("./argument-blueprint").ArgumentBlueprint | null;
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
  /** ENG-PR-096a：用户勾选的 RAG 来源；未传则沿用全量检索结果 */
  selectedSourceIds?: string[];
  /** ENG-PR-096b：本节扩写要点（3～8 条） */
  bullets?: string[];
  /** ENG-PR-096c：逐条扩写 — 当前要点下标（0-based） */
  bulletIndex?: number;
  /** ENG-PR-096c：已采纳并合并的章节草稿 */
  draftSoFar?: string;
}

export interface WritingStreamResult {
  content: string;
  verification: string;
  references: string[];
  citationWarnings: { num: number; overlap: number; context: string }[];
}
