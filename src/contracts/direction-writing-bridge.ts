/** Direction → Writing 桥接契约
 *
 * 定义从方向战略规划到写作项目的 Handoff 数据结构。
 * 所有字段为可选/加性——不破坏不从 Direction 创建的手动项目。
 */

// ==================== 文献角色 ====================

/** 一篇文献在论文中的角色 */
export type SourceRole = "core" | "supporting" | "background";

// ==================== 预确定文献 ====================

/** 从 Direction scan + 分析提取的单篇必读文献 */
export interface RequiredReference {
  /** 知识库文件名（用于 RAG 检索 sourceKey） */
  sourceKey: string;
  title: string;
  authors: string[];
  year: number;
  journal?: string;
  doi?: string;
  /** 在论文中的角色：核心引用 / 支撑引用 / 背景引用 */
  role: SourceRole;
  /** 建议分配到哪些综述章节 */
  assignedSections: string[];
}

// ==================== Handoff 上下文 ====================

/** Direction → Writing 的完整 Handoff 上下文 */
export interface DirectionWritingContext {
  /** 论文类型（综述 / 研究） */
  paperType: "review" | "research";
  /** 建议投稿期刊 */
  suggestedJournal?: string;
  /** 从 Direction scan + 分析提取的必读文献清单 */
  requiredReferences: RequiredReference[];
  /** 从 D3（研究缺口）提取：解释"为什么写这篇论文" */
  motivationFromGap?: string;
  /** 从 D6（实验补全路线）提取：需要补什么实验 */
  pendingExperiments?: string[];
  /** 从 D5/D7 提取的写作主题建议（用于 Blueprint 生成） */
  themeSuggestions?: string[];
  /** 来源的路线图候选人 ID（用于追溯） */
  roadmapCandidateId?: string;
  /** 方向文献 corpus 已确认（P1 备料完成） */
  literatureCorpusConfirmedAt?: number;
}

// ==================== 工具函数 ====================

/** 将 RequiredReference 转为项目 references 格式的 GB/T 引文字符串 */
export function requiredRefToCitation(ref: RequiredReference): string {
  const authorPart = ref.authors.length > 0
    ? ref.authors.slice(0, 3).join(", ") + (ref.authors.length > 3 ? ", 等" : "")
    : "";
  const yearPart = ref.year > 0 ? `(${ref.year})` : "";
  const titlePart = ref.title || "";
  const journalPart = ref.journal ? `. ${ref.journal}` : "";
  return [authorPart, yearPart, titlePart, journalPart]
    .filter(Boolean)
    .join(" ")
    .trim();
}

/** 将 RequiredReference[] 转为项目 references:string[]，用于批量 PATCH */
export function requiredRefsToCitationList(refs: RequiredReference[]): string[] {
  return refs.map(requiredRefToCitation);
}
