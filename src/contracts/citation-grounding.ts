/**
 * W3-AP-CITE-GROUND — 引用语义接地报告（编号合法但句意与题录/摘要不对齐）
 */

export interface CitationGroundingRef {
  /** 1-based 编号，与正文 [n] 一致 */
  index: number;
  title?: string | null;
  abstract?: string | null;
  /** 题录原文（无摘要时兜底） */
  content?: string | null;
}

export interface CitationGroundingHit {
  number: number;
  overlap: number;
  /** 是否低于阈值（可疑） */
  suspicious: boolean;
  /** 该条是否有足够文本可做语义对照 */
  groundable: boolean;
  citedSentence: string;
  refTitle?: string;
  reason: string;
}

export interface SoftGroundPoolStats {
  softGroundableCount: number;
  softCitedCount: number;
  softUnusedCount: number;
  softUnusedIndexes: number[];
  /** softUnused / softGroundable；无 soft 池时为 null */
  unusedRatio: number | null;
}

export interface CitationGroundingReport {
  checkedCount: number;
  suspiciousCount: number;
  ungroundableCount: number;
  hits: CitationGroundingHit[];
  softPool: SoftGroundPoolStats;
  hint: string;
}

export interface CitationGroundingInput {
  draftText: string;
  references: CitationGroundingRef[];
  /** 句–题录词重叠阈值，默认 0.08 */
  overlapThreshold?: number;
  /** 返回的可疑样本上限，默认 12 */
  maxSuspicious?: number;
}
