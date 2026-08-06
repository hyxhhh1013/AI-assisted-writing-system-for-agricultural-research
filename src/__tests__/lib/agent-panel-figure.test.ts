import { describe, expect, it } from "vitest";
import { parsePanelsJson } from "@/lib/agent/tools/generate-chart";

describe("generate_chart panelsJson (multi-panel composite)", () => {
  it("parses valid panels", () => {
    const r = parsePanelsJson(
      JSON.stringify([
        {
          chartType: "bar_grouped",
          csv: "处理,产量,产量_sd\n对照,12,1\n处理A,15,0.9",
          xLabel: "处理",
          yLabel: "产量 (kg/ha)",
        },
        { chartType: "line", csv: "天数,N2\n1,10\n2,20", xLabel: "天数" },
      ]),
    );
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.panels).toHaveLength(2);
      expect(r.panels[0]?.chartType).toBe("bar_grouped");
      expect(r.panels[0]?.xLabel).toBe("处理");
      expect(r.panels[1]?.chartType).toBe("line");
    }
  });

  it("rejects invalid chartType", () => {
    const r = parsePanelsJson('[{"chartType":"box_plot","csv":"a,b"}]');
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.error).toContain("无效 chartType");
  });

  it("rejects missing csv", () => {
    const r = parsePanelsJson('[{"chartType":"line"}]');
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.error).toContain("缺 csv");
  });

  it("rejects too many panels", () => {
    const panels = Array.from({ length: 7 }, (_, i) => ({
      chartType: "line",
      csv: `x,y\n${i},1`,
    }));
    const r = parsePanelsJson(JSON.stringify(panels));
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.error).toContain("最多");
  });

  it("rejects non-array json", () => {
    const r = parsePanelsJson('{"a":1}');
    expect("error" in r).toBe(true);
  });
});
