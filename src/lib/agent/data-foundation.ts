/**
 * 项目数据根基：出图 / 写结果 / inspect 共用同一套判定。
 * @see docs/plans/W3-AP-AGENT-HUB.md W3-AP-DATA-01
 */

import { ruleText } from "@/lib/agent/core/agent-rules";

export type DataFoundationStatus = "empty" | "claims_only" | "tabular" | "instrument";

export interface DataFoundationInput {
  claimCount: number;
  sourceCount: number;
  candidateCount: number;
  /** 仪器源（峰表/谱）数量；DATA-03 才会稳定写入，缺省 0 */
  instrumentSourceCount?: number;
}

export interface DataFoundation {
  status: DataFoundationStatus;
  claimCount: number;
  sourceCount: number;
  candidateCount: number;
  instrumentSourceCount: number;
  /** 一行给人 / Agent 看 */
  brief: string;
}

export function assessDataFoundation(input: DataFoundationInput): DataFoundation {
  const claimCount = Math.max(0, input.claimCount);
  const sourceCount = Math.max(0, input.sourceCount);
  const candidateCount = Math.max(0, input.candidateCount);
  const instrumentSourceCount = Math.max(0, input.instrumentSourceCount ?? 0);

  let status: DataFoundationStatus = "empty";
  if (instrumentSourceCount > 0) {
    status = "instrument";
  } else if (sourceCount > 0 || candidateCount > 0) {
    status = "tabular";
  } else if (claimCount > 0) {
    status = "claims_only";
  }

  return {
    status,
    claimCount,
    sourceCount,
    candidateCount,
    instrumentSourceCount,
    brief: formatDataFoundationBrief({
      status,
      claimCount,
      sourceCount,
      candidateCount,
      instrumentSourceCount,
    }),
  };
}

function formatDataFoundationBrief(f: Omit<DataFoundation, "brief">): string {
  if (f.status === "empty") {
    return "数据根基：无。研究型写结果前请在 Agent 对话框上传 CSV/Excel（或仪器数据），不要编造数值。";
  }
  if (f.status === "claims_only") {
    return `数据根基：仅有 ${f.claimCount} 条证据声明，尚无结构化表。写结果须引用这些声明；出图请先入库表格。`;
  }
  if (f.status === "instrument") {
    return `数据根基：仪器源 ${f.instrumentSourceCount} 个，声明 ${f.claimCount} 条，可配图 ${f.candidateCount}。`;
  }
  return `数据根基：数据源 ${f.sourceCount} 个，声明 ${f.claimCount} 条，可配图 ${f.candidateCount}。`;
}

/** 仅研究型 results 在 empty 时硬拦；综述/方法/讨论不拦 */
export function shouldBlockResultsWrite(
  mode: "review" | "research" | string,
  section: string,
  status: DataFoundationStatus,
): boolean {
  return mode === "research" && section.trim().toLowerCase() === "results" && status === "empty";
}

export function resultsWriteBlockMessage(): string {
  return ruleText("results-data-foundation");
}
