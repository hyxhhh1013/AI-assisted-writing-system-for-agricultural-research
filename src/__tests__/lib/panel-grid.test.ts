import { describe, expect, it } from "vitest";
import { parsePanelGrid } from "@/lib/agent/panel-grid";

describe("panel grid", () => {
  it("reads a two-column XPS grid without inventing components", () => {
    const parsed = parsePanelGrid(JSON.stringify({
      cols: 2,
      panels: [
        { sourceFileNames: ["1.xlsx · Fe2p Scan"], kind: "xps", title: "Fe 2p" },
        { sourceFileNames: ["2.xlsx · Cu2p Scan"], kind: "xps", title: "Cu 2p" },
      ],
    }));
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(parsed.cols).toBe(2);
    expect(parsed.panels[0]?.kind).toBe("xps");
    expect(parsed.panels[0]?.peaks).toEqual([]);
    expect(parsed.panels[0]?.guides).toEqual([]);
  });

  it("rejects a single panel and a peak without a position", () => {
    expect(parsePanelGrid('[{"sourceFileNames":["a.xy"],"kind":"xrd"}]')).toEqual({
      error: "组图至少 2 格。单张谱用 plot_peak_stack",
    });
    const bad = parsePanelGrid(JSON.stringify([
      { sourceFileNames: ["a.xy"], kind: "xrd", peaks: [{ label: "Cu" }] },
      { sourceFileNames: ["b.xy"], kind: "xrd" },
    ]));
    expect(bad).toEqual({ error: "第 1 格：每个峰标记都要有数字 x，不要写无法定位的名称" });
  });
});
