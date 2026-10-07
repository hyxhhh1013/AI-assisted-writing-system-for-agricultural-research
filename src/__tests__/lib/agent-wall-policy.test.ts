import { describe, expect, it } from "vitest";
import {
  AGENT_WALL_LIMITS,
  decideAfterWall,
  resolveLlmToolRequest,
  toolsUnderRestrict,
} from "@/lib/agent/core/wall-policy";
import {
  countFigureQaFailsThisRun,
  latestFigurePlotHref,
  pendingFigureRedraw,
} from "@/lib/agent/figure-loop";
import { routeAfterAgent, type AgentGraphStateType } from "@/lib/agent/langgraph/state";
import type { ToolObservation } from "@/lib/agent/types";

const draft = (n: number): ToolObservation => ({
  tool: "draft_mechanism_figure",
  success: true,
  data: { imageUrl: `/api/charts/m${n}.png`, href: `/plot?fig=m${n}` },
});
const qaRegen = (n: number): ToolObservation => ({
  tool: "read_figure",
  success: true,
  data: { mode: "qa", needsRegen: true, qaVerdict: "regen", imageUrl: `/api/charts/m${n}.png` },
});
const qaPass = (n: number): ToolObservation => ({
  tool: "read_figure",
  success: true,
  data: { mode: "qa", qaVerdict: "pass", imageUrl: `/api/charts/m${n}.png` },
});
const chartBlocked: ToolObservation = {
  tool: "generate_chart",
  success: true,
  data: { blocked: true, qaReport: { verdict: "block" }, imageUrl: "/api/charts/c1.png" },
};
const chartOk: ToolObservation = {
  tool: "generate_chart",
  success: true,
  data: { imageUrl: "/api/charts/c2.png" },
};

/** 线上会话 cmuntp1ls：机理图 draft → 识图要求重画，连续多轮 */
function regenLoop(times: number): ToolObservation[] {
  const out: ToolObservation[] = [];
  for (let i = 1; i <= times; i++) out.push(draft(i), qaRegen(i));
  return out;
}

describe("decideAfterWall", () => {
  it("hints below the limit, asks the user at the limit", () => {
    const limit = AGENT_WALL_LIMITS.figure_qa;
    expect(decideAfterWall({ kind: "figure_qa", hits: limit - 1 }).kind).toBe("hint");
    const ask = decideAfterWall({ kind: "figure_qa", hits: limit, plotHref: "/plot?fig=x" });
    expect(ask.kind).toBe("ask");
    if (ask.kind === "ask") {
      expect(ask.question).toContain("1.");
      expect(ask.question).toContain("/plot?fig=x");
    }
  });

  it("read / search / gate walls stay a hint until the limit, then restrict or run", () => {
    expect(AGENT_WALL_LIMITS.read_spam).toBe(6);
    expect(AGENT_WALL_LIMITS.search_storm).toBe(6);
    expect(AGENT_WALL_LIMITS.gate_bounce).toBe(2);
    expect(decideAfterWall({ kind: "read_spam", hits: 5 }).kind).toBe("hint");
    const restricted = decideAfterWall({
      kind: "read_spam",
      hits: 6,
      suggestTools: ["refine_content"],
    });
    expect(restricted).toMatchObject({ kind: "restrict", tools: ["refine_content"] });
    const run = decideAfterWall({
      kind: "search_storm",
      hits: 6,
      runCall: { id: "c1", name: "import_reference", args: {} },
    });
    expect(run).toMatchObject({ kind: "run", call: { name: "import_reference" } });
    expect(decideAfterWall({ kind: "gate_bounce", hits: 2 }).kind).toBe("ask");
  });
});

describe("resolveLlmToolRequest", () => {
  const tools = [
    { name: "ask_user" },
    { name: "write_section" },
    { name: "search_knowledge" },
    { name: "refine_content" },
  ];

  it("leaves the full set alone when nothing is restricted", () => {
    const req = resolveLlmToolRequest(tools, null);
    expect(req.toolChoice).toBe("auto");
    expect(req.clearRestrict).toBe(false);
    expect(req.tools.map((tool) => tool.name)).toEqual(tools.map((tool) => tool.name));
  });

  it("one restricted turn keeps only the named tools plus ask_user, then clears", () => {
    const req = resolveLlmToolRequest(tools, ["refine_content"]);
    expect(req.toolChoice).toBe("required");
    expect(req.clearRestrict).toBe(true);
    expect(req.tools.map((tool) => tool.name)).toEqual(["ask_user", "refine_content"]);
    expect(toolsUnderRestrict(tools, ["search_knowledge"]).map((tool) => tool.name))
      .toEqual(["ask_user", "search_knowledge"]);
  });
});

describe("countFigureQaFailsThisRun", () => {
  it("counts consecutive vision-QA regen verdicts", () => {
    expect(countFigureQaFailsThisRun(regenLoop(3))).toBe(3);
  });

  it("a passing QA resets the count", () => {
    expect(countFigureQaFailsThisRun([...regenLoop(2), draft(9), qaPass(9), ...regenLoop(1)])).toBe(1);
  });

  it("blocked data charts count, an unblocked chart resets", () => {
    expect(countFigureQaFailsThisRun([chartBlocked, chartBlocked])).toBe(2);
    expect(countFigureQaFailsThisRun([chartBlocked, chartOk])).toBe(0);
  });

  it("only counts after the latest user message (intentObsOffset)", () => {
    const obs = [...regenLoop(3), ...regenLoop(1)];
    expect(countFigureQaFailsThisRun(obs, 6)).toBe(1);
  });

  it("describe-mode read_figure is neither pass nor fail", () => {
    const describe: ToolObservation = {
      tool: "read_figure",
      success: true,
      data: { mode: "describe", description: "需重生成" },
    };
    expect(countFigureQaFailsThisRun([...regenLoop(2), describe])).toBe(2);
  });
});

describe("pendingFigureRedraw", () => {
  it("keeps forcing a redraw before the wall", () => {
    expect(pendingFigureRedraw(regenLoop(2))).toEqual({ imageUrl: "/api/charts/m2.png" });
  });

  it("stops forcing once the wall is reached", () => {
    expect(pendingFigureRedraw(regenLoop(3))).toBeNull();
  });

  it("a new user message re-opens automatic redraws", () => {
    const obs = regenLoop(3);
    expect(pendingFigureRedraw(obs, 4)).toEqual({ imageUrl: "/api/charts/m3.png" });
  });
});

describe("latestFigurePlotHref", () => {
  it("returns the newest /plot link from figure tools", () => {
    expect(latestFigurePlotHref(regenLoop(2))).toBe("/plot?fig=m2");
  });
});

describe("routeAfterAgent figure wall", () => {
  function base(overrides: Partial<AgentGraphStateType> = {}): AgentGraphStateType {
    return {
      goal: "生成图 1 综述框架图",
      plan: null,
      messages: [],
      iteration: 3,
      toolCallCount: 0,
      planContinueCount: 0,
      reflectCount: 0,
      finalThought: "",
      toolSummaries: [],
      observations: [],
      pendingToolCalls: [],
      finished: true,
      error: null,
      events: [],
      awaitingCheckpoint: null,
      awaitingConfirm: null,
      grantedConfirm: null,
      intentKind: null,
      intentObsOffset: 0,
      approvedCheckpointKinds: [],
      toolTrace: [],
      restrictToolsOnce: null,
      ...overrides,
    };
  }

  it("bounces back to agent while redraws are still allowed", () => {
    expect(routeAfterAgent(base({ observations: regenLoop(1) }))).toBe("agent");
  });

  it("no longer bounces back after the wall", () => {
    expect(routeAfterAgent(base({ observations: regenLoop(3) }))).toBe("finalize");
  });
});
