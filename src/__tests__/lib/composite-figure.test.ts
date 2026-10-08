import { describe, expect, it } from "vitest";
import { encodeFigureSpecParam, type ProjectChartAsset } from "@/contracts/figure";
import {
  assetToCompositePanel,
  compositePanelCountError,
  placeCompositePanels,
} from "@/lib/composite-figure";

describe("placeCompositePanels", () => {
  it("两列时第二格可以占满一行", () => {
    expect(placeCompositePanels([1, 2, 1], 2)).toEqual([
      { row: 0, col: 0, span: 1 },
      { row: 1, col: 0, span: 2 },
      { row: 2, col: 0, span: 1 },
    ]);
  });

  it("单列时跨列无效", () => {
    expect(placeCompositePanels([2, 2], 1)).toEqual([
      { row: 0, col: 0, span: 1 },
      { row: 1, col: 0, span: 1 },
    ]);
  });
});

describe("assetToCompositePanel", () => {
  it("没有数据快照的图不能进组图", () => {
    const asset: ProjectChartAsset = {
      id: "a",
      figureId: "flow",
      caption: "流程",
      imageUrl: "/api/charts/a.png",
      createdAt: 1,
    };
    expect(assetToCompositePanel(asset)).toBeNull();
  });

  it("能从图表快照抽出 CSV 和轴标签", () => {
    const asset: ProjectChartAsset = {
      id: "b",
      figureId: "bar_grouped",
      caption: "产量",
      imageUrl: "/api/charts/b.png",
      createdAt: 1,
      figureSpecEnc: encodeFigureSpecParam({
        tool: "chart",
        caption: "产量",
        config: {
          type: "bar",
          title: "产量",
          x_label: "处理",
          y_label: "kg/ha",
          data: {
            labels: ["对照", "处理"],
            datasets: [{ label: "产量", data: [12, 15] }],
          },
        },
      }),
    };
    const panel = assetToCompositePanel(asset);
    expect(panel?.chartType).toBeTruthy();
    expect(panel?.csv).toContain("对照");
    expect(panel?.xLabel).toBe("处理");
    expect(panel?.yLabel).toBe("kg/ha");
  });
});

describe("compositePanelCountError", () => {
  it("限制 2 到 6 张", () => {
    expect(compositePanelCountError(1)).toMatch(/两张/);
    expect(compositePanelCountError(2)).toBeNull();
    expect(compositePanelCountError(7)).toMatch(/六张/);
  });
});
