import type { ConsistencyIssue, ConsistencyReport } from "@/types/consistency";

export type { ConsistencyIssue, ConsistencyReport };

/** POST /api/consistency 请求体 */
export interface ConsistencyCheckInput {
  title: string;
  sections: { key: string; content: string }[];
  outline?: string;
  dataClaims?: {
    id: string;
    text: string;
    values: Record<string, number | string>;
  }[];
}

/** 问题状态：open → fixing → fixed / dismissed */
export type IssueStatus = "open" | "fixing" | "fixed" | "dismissed";

/** 扩展问题类型，增加修复流程状态 */
export interface FixableIssue extends ConsistencyIssue {
  status: IssueStatus;
  fixedContent?: string;
}

/** 扩展报告类型 */
export interface FixableReport {
  passed: boolean;
  issues: FixableIssue[];
  summary: string;
}

/** AI 修复请求 */
export interface FixIssueRequest {
  issue: ConsistencyIssue;
  sectionContents: Record<string, string>;
  outline?: string;
  title: string;
}
