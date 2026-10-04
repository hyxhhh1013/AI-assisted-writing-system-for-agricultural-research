/**
 * 撞墙后的下一步：第一次撞同一面墙仍提示模型；累计到上限后由代码决定，不再让模型换说法重试。
 * 纯函数，不调 LLM。
 */

export type AgentWallKind = "figure_qa";

/** 每面墙允许模型自行重试的次数（含第一次）；达到即由代码接管 */
export const AGENT_WALL_LIMITS: Record<AgentWallKind, number> = {
  figure_qa: 3,
};

export interface AgentWallInput {
  kind: AgentWallKind;
  /** 本轮已撞这面墙的次数（含刚撞的这一次） */
  hits: number;
  imageUrl?: string;
  plotHref?: string;
}

export type AgentWallDecision =
  | { kind: "hint" }
  | { kind: "ask"; question: string; reason: string };

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

export function decideAfterWall(input: AgentWallInput): AgentWallDecision {
  if (!isAgentWallReached(input.kind, input.hits)) return { kind: "hint" };
  switch (input.kind) {
    case "figure_qa":
      return {
        kind: "ask",
        question: figureQaQuestion(input.hits, input.plotHref),
        reason: `figure_qa 连续 ${input.hits} 次未过线，停止自动重画`,
      };
  }
}
