import { describe, expect, it } from "vitest";
import type { AgentUiMessage } from "@/contracts/agent-session";
import type { ProjectChartAsset } from "@/contracts/figure";
import {
  collectSessionFigureDockItems,
  mergeProjectChartsIntoDock,
  resolvePlotHrefFromObservation,
  withReplaceImageUrlParam,
} from "@/lib/agent/figure-dock";

describe("figure-dock", () => {
  it("collectSessionFigureDockItems keeps newest unique imageUrl", () => {
    const messages: AgentUiMessage[] = [
      {
        kind: "observation",
        tool: "draft_mechanism_figure",
        imageUrl: "/api/charts/old.png",
        summary: "已生成流程图「图旧」",
      },
      {
        kind: "observation",
        tool: "draft_mechanism_figure",
        imageUrl: "/api/charts/new.png",
        sectionKey: "literature_body",
        insertMode: "appended",
        plotHref: "/plot?id=p1&figure=flow",
        summary: "已生成流程图「图5」",
      },
      {
        kind: "observation",
        tool: "draft_mechanism_figure",
        imageUrl: "/api/charts/new.png",
        summary: "重复同一张",
      },
    ];
    const items = collectSessionFigureDockItems(messages, 6);
    expect(items).toHaveLength(2);
    expect(items[0]?.imageUrl).toBe("/api/charts/new.png");
    expect(items[0]?.title).toBe("图5");
    expect(items[0]?.sectionKey).toBe("literature_body");
    expect(items[1]?.imageUrl).toBe("/api/charts/old.png");
  });

  it("mergeProjectChartsIntoDock fills section and plotHref from assets", () => {
    const session = collectSessionFigureDockItems(
      [
        {
          kind: "observation",
          tool: "generate_chart",
          imageUrl: "/api/charts/a.png",
          summary: "已生成",
        },
      ],
      6,
      "p1",
    );
    const charts: ProjectChartAsset[] = [
      {
        id: "c1",
        figureId: "flow",
        caption: "图A",
        imageUrl: "/api/charts/a.png",
        sectionKey: "results",
        figureSpecEnc: "enc-a",
        createdAt: 2,
      },
      {
        id: "c2",
        figureId: "flow",
        caption: "图B",
        imageUrl: "/api/charts/b.png",
        sectionKey: "methods",
        figureSpecEnc: "enc-b",
        createdAt: 1,
      },
    ];
    const merged = mergeProjectChartsIntoDock(session, charts, 6, "p1");
    expect(merged[0]?.sectionKey).toBe("results");
    expect(merged[0]?.title).toBe("图A");
    expect(merged[0]?.plotHref).toContain("chartAssetId=c1");
    expect(merged.some((x) => x.imageUrl === "/api/charts/b.png")).toBe(true);
  });

  it("resolvePlotHrefFromObservation rebuilds from figureSpecEnc + asset id", () => {
    const href = resolvePlotHrefFromObservation(
      {
        kind: "observation",
        tool: "generate_chart",
        imageUrl: "/api/charts/z.png",
        data: {
          chartType: "line",
          figureSpecEnc: "enc-z",
          persisted: { id: "asset-z", figureId: "line" },
        },
      },
      "proj-1",
    );
    expect(href).toContain("/plot?");
    expect(href).toContain("chartAssetId=asset-z");
    expect(href).not.toContain("figureSpec=");
  });

  it("withReplaceImageUrlParam appends once", () => {
    const href = withReplaceImageUrlParam(
      "/plot?id=p1&figure=flow",
      "/api/charts/x.png",
    );
    expect(href).toContain("replaceImageUrl=%2Fapi%2Fcharts%2Fx.png");
    const again = withReplaceImageUrlParam(href, "/api/charts/y.png");
    expect(again).toBe(href);
  });
});
