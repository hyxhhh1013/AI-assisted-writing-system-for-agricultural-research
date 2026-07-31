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
