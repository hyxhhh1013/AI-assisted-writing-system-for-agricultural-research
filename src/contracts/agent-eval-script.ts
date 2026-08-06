/**
 * W3-AP-EVAL-SCRIPTS — Agent 行为剧本契约（无 LLM，轨迹断言）
 * @see docs/plans/W3-AP-BEHAVIOR.md
 */

export type AgentScriptId =
  | "P1"
  | "P2"
  | "P3"
  | "P4"
  | "P5"
  | "P6"
  | "P7"
  | "FILE-READ";

/** 单次工具观测 */
export interface AgentScriptToolStep {
  tool: string;
  params?: Record<string, unknown>;
  success?: boolean;
  /** observation.data 摘要字段 */
  data?: Record<string, unknown>;
}

/** 一轮用户目标下的执行轨迹（可录制 / 手写 golden） */
export interface AgentScriptTrace {
  scriptId: AgentScriptId;
  /** 用户目标（多轮时按顺序） */
  goals: string[];
  tools: AgentScriptToolStep[];
  /** 是否出现过 agent/confirm */
  hadConfirm?: boolean;
  /** 是否进入 outline_approve 检查点 */
  hadOutlineCheckpoint?: boolean;
  /** 最终助手回复（summary / finalThought） */
  finalText?: string;
  /** 写回后参考文献条数（可选） */
  referenceCountAfter?: number;
  referenceCountBefore?: number;
}

export interface AgentScriptAssertionFail {
  code: string;
  message: string;
}

export interface AgentScriptCaseResult {
  scriptId: AgentScriptId;
  fixtureId: string;
  /** 该 fixture 预期是否通过断言 */
  expectPass: boolean;
  ok: boolean;
  failures: AgentScriptAssertionFail[];
}
