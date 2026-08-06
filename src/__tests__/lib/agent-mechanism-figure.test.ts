import { describe, expect, it } from "vitest";
import {
  buildFlowDiagramConfig,
  buildMechanismPanelConfig,
} from "@/lib/agent/tools/draft-mechanism-figure";

describe("draft_mechanism_figure config builders", () => {
  it("builds flow diagram config with nodes and edges", () => {
    const cfg = buildFlowDiagramConfig({ title: "热解流程", notes: "500°C" });
    expect(cfg.title).toBe("热解流程");
    expect(cfg.preset).toBe("nature");
    expect(Array.isArray(cfg.nodes)).toBe(true);
    expect((cfg.nodes as unknown[]).length).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(cfg.edges)).toBe(true);
  });

  it("builds flow from user-provided steps (not hardcoded)", () => {
    const cfg = buildFlowDiagramConfig({
      title: "生物炭制备",
      notes: "",
      flowSteps: ["原料预处理", "热解反应", "产物分离", "生物炭"],
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

  it("falls back to template when fewer than 2 steps", () => {
    const cfg = buildFlowDiagramConfig({ title: "x", notes: "", flowSteps: ["一步"] });
    const nodes = cfg.nodes as unknown[];
    // 模板有 5 个节点
    expect(nodes.length).toBe(5);
  });

  it("builds mechanism panel config with provided panel titles", () => {
    const cfg = buildMechanismPanelConfig({
      title: "机理图",
      panelTitles: ["A", "B"],
      notes: "",
    });
    const panels = cfg.panels as Array<{ title: string; blocks: unknown[] }>;
    expect(panels.length).toBe(2);
    expect(panels[0]?.title).toBe("A");
    expect(cfg.preset).toBe("nature");
    expect(panels[0]?.blocks.length).toBeGreaterThan(0);
  });

  it("fills default panel titles when fewer than two provided", () => {
    const cfg = buildMechanismPanelConfig({
      title: "x",
      panelTitles: [],
      notes: "",
    });
    const panels = cfg.panels as unknown[];
    expect(panels.length).toBeGreaterThanOrEqual(2);
  });

  it("caps panel titles at three", () => {
    const cfg = buildMechanismPanelConfig({
      title: "x",
      panelTitles: ["a", "b", "c", "d"],
      notes: "",
    });
    const panels = cfg.panels as unknown[];
    expect(panels.length).toBe(3);
  });
});
