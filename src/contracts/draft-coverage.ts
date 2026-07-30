/**
 * W3-AP-DRAFT-COVER — 分节完整度 / 薄节报告
 */

export type DraftSectionStatus = "empty" | "thin" | "ok";

export interface DraftSectionTarget {
  key: string;
  /** 达标最低字数（字符） */
  minChars: number;
  /** 薄节告警线（低于此且非 empty → thin） */
  thinBelow: number;
  /** 必写 / 推荐 */
  required: boolean;
  /** 互斥组：同组内任一达标即可（如 background|literature_body） */
  altGroup?: string;
}

export interface DraftSectionCoverage {
  key: string;
  chars: number;
  minChars: number;
  thinBelow: number;
  required: boolean;
  altGroup?: string;
  status: DraftSectionStatus;
  ratio: number;
}

export interface DraftCoverageReport {
  mode: "review" | "research";
  language: "zh" | "en";
  sections: DraftSectionCoverage[];
  /** 空白（必写或推荐期望节） */
  emptyKeys: string[];
  /** 过薄 */
  thinKeys: string[];
  /** 必写缺口（含 alt 组未满足） */
  requiredGaps: string[];
  /** 建议下一节 write_section key */
  nextSectionKey: string | null;
  bodyChars: number;
  okRequiredCount: number;
  requiredCount: number;
  hint: string;
}

export interface DraftCoverageInput {
  mode: "review" | "research";
  language?: "zh" | "en";
  /** section key → 正文字符数 */
  sectionChars: Record<string, number>;
}
