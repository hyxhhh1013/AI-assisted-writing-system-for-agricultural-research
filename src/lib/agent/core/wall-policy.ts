/**
 * 撞墙后的下一步：第一次撞同一面墙仍提示模型；累计到上限后由代码决定，不再让模型换说法重试。
 * 纯函数，不调 LLM。
 *
 * read_spam / search_storm / gate_bounce 的计数触发在 WALL-02～04。
 * 这里先把上限、restrict / run 决策，以及「下一轮只许用这些工具」的请求形状备好。
 */

import type { ParsedToolCall } from "@/lib/agent/types";

export type AgentWallKind = "figure_qa" | "read_spam" | "search_storm" | "gate_bounce";

/** 每面墙允许模型自行重试的次数（含第一次）；达到即由代码接管。调大等于关掉这道墙 */
export const AGENT_WALL_LIMITS: Record<AgentWallKind, number> = {
  figure_qa: 3,
  read_spam: 6,
  search_storm: 6,
  gate_bounce: 2,
};

export interface AgentWallInput {
  kind: AgentWallKind;
  /** 本轮已撞这面墙的次数（含刚撞的这一次） */
  hits: number;
  imageUrl?: string;
  plotHref?: string;
  /** 到上限后下一轮只许用这些工具（再加 ask_user） */
  suggestTools?: readonly string[];
  /** 到上限后由代码直接插入的一次调用 */
  runCall?: ParsedToolCall;
  /** 没有 suggestTools / runCall 时的选项文案 */
  question?: string;
}

export type AgentWallDecision =
  | { kind: "hint" }
  | { kind: "ask"; question: string; reason: string }
  | { kind: "restrict"; tools: string[]; reason: string }
  | { kind: "run"; call: ParsedToolCall; reason: string };

export function isAgentWallReached(kind: AgentWallKind, hits: number): boolean {
  return hits >= AGENT_WALL_LIMITS[kind];
}

function figureQaQuestion(hits: number, plotHref?: string): string {
  const plot = plotHref ? `（${plotHref}）` : "";
  return [
    `这张图已经自动重画 ${hits} 次，质检还是没过线，我先停下，不再自己换说法重画。请选一个：`,
    "1. 先用当前这一版，之后再说",
    `2. 去绘图页手动精修${plot}`,
    "3. 我说一下想怎么改（版式、节点、配色），你按这个再画一次",
    "4. 删掉这张图，不要了",
  ].join("\n");
}

function defaultAsk(kind: AgentWallKind): string {
  switch (kind) {
    case "read_spam":
      return "这一轮读得太多了。请选：1. 基于已读的先改 2. 再读几篇 3. 换个思路";
    case "search_storm":
      return "连着检索还没有新文献。请选：1. 换关键词方向 2. 用现有文献继续 3. 先停";
    case "gate_bounce":
      return "同一个工具被拦住两次了。请换一种做法，或直接说下一步。";
    default:
      return "请选下一步。";
  }
}

export function decideAfterWall(input: AgentWallInput): AgentWallDecision {
  if (!isAgentWallReached(input.kind, input.hits)) return { kind: "hint" };
  if (input.kind === "figure_qa") {
    return {
      kind: "ask",
      question: figureQaQuestion(input.hits, input.plotHref),
      reason: `figure_qa 连续 ${input.hits} 次未过线，停止自动重画`,
    };
  }
  const reason = `${input.kind} 达到上限 ${AGENT_WALL_LIMITS[input.kind]}（本轮 ${input.hits} 次）`;
  if (input.runCall) {
    return { kind: "run", call: input.runCall, reason };
  }
  if (input.suggestTools && input.suggestTools.length > 0) {
    return { kind: "restrict", tools: [...input.suggestTools], reason };
  }
  return {
    kind: "ask",
    question: input.question ?? defaultAsk(input.kind),
    reason,
  };
}

/** 受限轮只把点名工具和 ask_user 交给模型 */
export function toolsUnderRestrict<T extends { name: string }>(
  tools: readonly T[],
  names: readonly string[],
): T[] {
  const allow = new Set(names);
  allow.add("ask_user");
  return tools.filter((tool) => allow.has(tool.name));
}

/**
 * 有 restrictToolsOnce 且调用方已确认没有待执行的检查点调用时，
 * 本轮 LLM 只看到这些工具，并要求必须调用。用完由 agentNode 清空。
 */
export function resolveLlmToolRequest<T extends { name: string }>(
  tools: readonly T[],
  restrictToolsOnce: readonly string[] | null | undefined,
): { tools: T[]; toolChoice: "auto" | "required"; clearRestrict: boolean } {
  const names = restrictToolsOnce ?? [];
  if (names.length === 0) {
    return { tools: [...tools], toolChoice: "auto", clearRestrict: false };
  }
  return {
    tools: toolsUnderRestrict(tools, names),
    toolChoice: "required",
    clearRestrict: true,
  };
}
