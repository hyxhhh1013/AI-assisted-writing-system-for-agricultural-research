/**
 * W3-AP-CLAIM-GROUND — 引用级 grounding（claim 支撑判定）。
 *
 * 与 citation-grounding（词重叠代理）分层：词重叠是快速、免费的第一层；
 * 本层用 verifier LLM 对「含引用的正文句」逐条判 support / contradict / neutral，
 * 把「编号合法但句意张冠李戴」的错引暴露出来，可回喂 Agent 改引/改写。
 */

export type ClaimSupportVerdict = "support" | "contradict" | "neutral";

/** 单条判定结果（judge 输出，number 对齐正文 [n]） */
export interface ClaimJudgeVerdict {
  number: number;
  verdict: ClaimSupportVerdict;
  reason: string;
}

/** 送判单条（judge 输入） */
export interface ClaimJudgeItem {
  number: number;
  citedSentence: string;
  refTitle: string;
  /** 题录 + 摘要拼接后的对照语料 */
  refText: string;
}

/** 可注入的 judge：无 key 测试用 fake，生产用 LLM judge */
export type ClaimSupportJudge = (
  items: ClaimJudgeItem[],
) => Promise<ClaimJudgeVerdict[]>;

/** 报告中的单条（含上下文，供 UI/摘要展示） */
export interface ClaimGroundingItem {
  number: number;
  citedSentence: string;
  refTitle?: string;
  verdict: ClaimSupportVerdict;
  reason: string;
}

export interface ClaimGroundingReport {
  /** 送入判定的条目数（有足够题录/摘要可判） */
  judgedCount: number;
  supportCount: number;
  contradictCount: number;
  neutralCount: number;
  /** 缺摘要/题录过短而跳过的条目数 */
  skippedCount: number;
  /** support 占比 = supportCount / judgedCount；无判定时 null */
  supportRate: number | null;
  items: ClaimGroundingItem[];
  hint: string;
}

/** evaluateCitationClaimGrounding 的输入 */
export interface ClaimGroundingInput {
  draftText: string;
  references: Array<{
    index: number;
    title?: string | null;
    abstract?: string | null;
    content?: string | null;
  }>;
}
