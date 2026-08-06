import { describe, expect, it } from "vitest";
import { collectWritingFigureEditItems } from "@/components/shared/writing/writing-figure-edit-links";
import { chartAssetToPlotHref } from "@/contracts/figure";

const SAMPLE_CHART_BLOCK =
  '【FIGURE:{"tool":"chart","config":{"type":"bar","data":{"labels":["A","B"],"datasets":[{"label":"产量","data":[10,20]}]}},"caption":"图3 产量对比"}】';

describe("collectWritingFigureEditItems", () => {
  it("collects plot links from FIGURE markers in text", () => {
    const items = collectWritingFigureEditItems("p1", `段落\n${SAMPLE_CHART_BLOCK}\n结尾`);
    expect(items).toHaveLength(1);
    expect(items[0]?.caption).toBe("图3 产量对比");
    expect(items[0]?.figureId).toBe("bar_grouped");
    expect(items[0]?.href).toContain("/plot?");
    expect(items[0]?.href).toContain("figureSpec=");
  });

  it("merges detected figures without duplicating caption", () => {
    const items = collectWritingFigureEditItems(
      "p1",
      SAMPLE_CHART_BLOCK,
      [
        {
          tool: "chart",
          config: JSON.stringify({
            type: "line",
            data: { labels: ["1"], datasets: [{ label: "y", data: [1] }] },
          }),
          caption: "图4 趋势",
        },
      ],
    );
    expect(items.map((i) => i.caption).sort()).toEqual(["图3 产量对比", "图4 趋势"]);
  });
});

describe("chartAssetToPlotHref", () => {
  it("opens plot page for registered asset figure type", () => {
    expect(
      chartAssetToPlotHref("proj-1", { id: "a1", figureId: "line", caption: "图2 趋势" }),
    ).toBe("/plot?id=proj-1&figure=line");
    expect(
      chartAssetToPlotHref("proj-1", {
        id: "a2",
        figureId: "line",
        caption: "图2 趋势",
        figureSpecEnc: "snap",
      }),
    ).toBe("/plot?id=proj-1&figure=line&chartAssetId=a2");
  });
});
