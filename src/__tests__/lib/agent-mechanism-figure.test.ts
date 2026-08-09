import { describe, expect, it } from "vitest";
import {
  buildFlowDiagramConfig,
  buildForkFlow,
  buildMechanismPanelConfig,
  defaultStepsForPanelTitle,
  pathwayTokensFromTitle,
} from "@/lib/agent/tools/draft-mechanism-figure";

describe("draft_mechanism_figure config builders", () => {
  it("builds flow from user-provided steps (not hardcoded English)", () => {
    const cfg = buildFlowDiagramConfig({
      title: "生物炭制备",
      notes: "",
      flowSteps: ["原料预处理", "热解反应", "产物分离", "生物炭"],
      layout: "chain",
    });
    const nodes = cfg.nodes as Array<{ id: string; label: string; role?: string }>;
    const edges = cfg.edges as Array<{ from: string; to: string }>;
    expect(nodes.map((n) => n.label)).toEqual([
      "原料预处理",
      "热解反应",
      "产物分离",
      "生物炭",
    ]);
    expect(nodes[0]?.role).toBe("start_end");
    expect(nodes[nodes.length - 1]?.role).toBe("start_end");
    expect(edges).toEqual([
      { from: "1", to: "2" },
      { from: "2", to: "3" },
      { from: "3", to: "4" },
    ]);
  });

  it("defaults ≥4 steps to fork layout (not a single column list)", () => {
    const { nodes, edges } = buildForkFlow([
      "生物质原料",
      "催化热解",
      "活性位调控",
      "碳流分配",
      "高值产物",
    ]);
    expect(nodes).toHaveLength(5);
    // hub(2) fans out to middles, middles converge to end
    expect(edges).toEqual(
      expect.arrayContaining([
        { from: "1", to: "2" },
        { from: "2", to: "3" },
        { from: "2", to: "4" },
        { from: "3", to: "5" },
        { from: "4", to: "5" },
      ]),
    );
  });

  it("falls back to Chinese steps from title (no Feedstock/Pathway English)", () => {
    const cfg = buildFlowDiagramConfig({ title: "催化热解转化过程", notes: "" });
    const labels = (cfg.nodes as Array<{ label: string }>).map((n) => n.label).join(" ");
    expect(labels).not.toMatch(/Feedstock|Pathway|Product|Conversion/i);
    expect(labels.length).toBeGreaterThan(4);
  });

  it("accepts custom nodesJson/edgesJson", () => {
    const cfg = buildFlowDiagramConfig({
      title: "双路径",
      notes: "",
      nodesJson: JSON.stringify([
        { id: "a", label: "原料", role: "start_end" },
        { id: "b", label: "路径甲", role: "process" },
        { id: "c", label: "路径乙", role: "process" },
        { id: "d", label: "产物", role: "start_end" },
      ]),
      edgesJson: JSON.stringify([
        { from: "a", to: "b" },
        { from: "a", to: "c" },
        { from: "b", to: "d" },
        { from: "c", to: "d" },
      ]),
    });
    const nodes = cfg.nodes as Array<{ id: string }>;
    const edges = cfg.edges as Array<{ from: string; to: string }>;
    expect(nodes.map((n) => n.id)).toEqual(["a", "b", "c", "d"]);
    expect(edges).toHaveLength(4);
  });

  it("parses pathway tokens from Chinese panel titles", () => {
    expect(pathwayTokensFromTitle("脱氧路径：脱水/脱羧/脱羰")).toEqual([
      "脱水",
      "脱羧",
      "脱羰",
    ]);
    const steps = defaultStepsForPanelTitle("脱氧路径：脱水/脱羧/脱羰");
    expect(steps[0]).toBe("含氧前体");
    expect(steps).toContain("脱水");
    expect(steps[steps.length - 1]).toBe("目标产物");
  });

  it("mechanism_panel uses flow_subgraph per panel — never Upload image placeholders", () => {
    const cfg = buildMechanismPanelConfig({
      title: "图2 脱氧与芳构化",
      panelTitles: ["脱氧路径：脱水/脱羧/脱羰", "芳构化与择形调控", "碱性添加剂脱酸"],
      notes: "分子筛酸位促进脱水脱羧；金属改性提升芳构化选择性。",
    });
    const panels = cfg.panels as Array<{
      title: string;
      blocks: Array<{ type: string; assetKey?: string; nodes?: unknown[]; content?: string }>;
    }>;
    expect(panels.length).toBe(3);
    for (const p of panels) {
      const types = p.blocks.map((b) => b.type);
      expect(types).toContain("flow_subgraph");
      expect(types).not.toContain("image");
      const flow = p.blocks.find((b) => b.type === "flow_subgraph");
      expect((flow?.nodes as unknown[])?.length).toBeGreaterThanOrEqual(2);
      const labels = ((flow?.nodes as Array<{ label: string }>) ?? [])
        .map((n) => n.label)
        .join(" ");
      expect(labels).not.toMatch(/Pathway|Product|M\/support|Upload/i);
    }
    // notes 只出现一次 callout，不进 footnote 重复
    const callouts = panels.flatMap((p) => p.blocks.filter((b) => b.type === "callout"));
    expect(callouts).toHaveLength(1);
    expect(callouts[0]?.content).toContain("分子筛");
    expect(panels.every((p) => !("footnote" in p && p.footnote))).toBe(true);
  });

  it("panelsJson drives Chinese steps per panel", () => {
    const cfg = buildMechanismPanelConfig({
      title: "机理",
      panelTitles: [],
      notes: "",
      panels: [
        {
          title: "脱氧",
          steps: ["含氧前体", "脱水", "脱羧", "脱氧产物"],
          bullets: ["酸位主导"],
        },
        {
          title: "芳构化",
          steps: ["烯烃", "环化", "芳烃"],
        },
      ],
    });
    const panels = cfg.panels as Array<{
      title: string;
      blocks: Array<{ type: string; content?: string; nodes?: Array<{ label: string }> }>;
    }>;
    expect(panels).toHaveLength(2);
    expect(panels[0]?.blocks.some((b) => b.type === "text" && b.content?.includes("酸位"))).toBe(
      true,
    );
    const flow0 = panels[0]?.blocks.find((b) => b.type === "flow_subgraph");
    expect(flow0?.nodes?.map((n) => n.label)).toEqual([
      "含氧前体",
      "脱水",
      "脱羧",
      "脱氧产物",
    ]);
  });

  it("caps panels at three", () => {
    const cfg = buildMechanismPanelConfig({
      title: "x",
      panelTitles: ["a", "b", "c", "d"],
      notes: "",
    });
    const panels = cfg.panels as unknown[];
    expect(panels.length).toBe(3);
  });
});
