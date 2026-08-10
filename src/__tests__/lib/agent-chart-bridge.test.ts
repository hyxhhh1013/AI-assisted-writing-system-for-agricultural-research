import { describe, expect, it } from "vitest";
import { extractChartPersisted } from "@/lib/agent/chart-persisted";
import { parseChartTabular } from "@/lib/chart-tabular-parse";
import { appendUiFromAgentEvent } from "@/lib/agent/ui-transcript";

describe("chart bridge", () => {
  it("parses simple csv for chart replay", () => {
    const parsed = parseChartTabular("温度,产气量\n500,44\n600,50");
    expect(parsed?.labels).toEqual(["500", "600"]);
    expect(parsed?.datasets[0]?.label).toBe("产气量");
    expect(parsed?.datasets[0]?.data).toEqual([44, 50]);
  });

  it("extracts chart persisted info from tool result", () => {
    const info = extractChartPersisted("generate_chart", {
      success: true,
      data: {
        imageUrl: "/api/charts/a.png",
        insertedSection: "results",
        persisted: {
          id: "c1",
          caption: "图1",
          sectionKey: "results",
        },
      },
    });
    expect(info).toMatchObject({
      imageUrl: "/api/charts/a.png",
      sectionKey: "results",
      caption: "图1",
      chartAssetId: "c1",
    });
  });

  it("extracts first chart from batch generate_chart result", () => {
    const info = extractChartPersisted("generate_chart", {
      success: true,
      data: {
        count: 2,
        charts: [
          {
            imageUrl: "/api/charts/b1.png",
            persisted: { id: "b1", caption: "图A" },
          },
          {
            imageUrl: "/api/charts/b2.png",
            persisted: { id: "b2", caption: "图B" },
          },
        ],
      },
    });
    expect(info).toMatchObject({
      imageUrl: "/api/charts/b1.png",
      caption: "图A",
      chartAssetId: "b1",
    });
  });

  it("stores imageUrl and plotHref on observation ui transcript", () => {
    const t = appendUiFromAgentEvent([], {
      type: "agent/observation",
      tool: "generate_chart",
      result: {
        success: true,
        summary: "已生成",
        data: {
          imageUrl: "/api/charts/x.png",
          href: "/plot?id=p1&figure=line&chartAssetId=c1",
          figureSpecEnc: "enc",
          persisted: { id: "c1" },
        },
      },
    });
    expect(t[0]).toMatchObject({
      kind: "observation",
      imageUrl: "/api/charts/x.png",
      plotHref: expect.stringContaining("chartAssetId=c1"),
    });
    expect((t[0] as { data?: { figureSpecEnc?: string } }).data?.figureSpecEnc).toBe("enc");
  });
});
