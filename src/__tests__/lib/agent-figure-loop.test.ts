import { describe, expect, it } from "vitest";
import type { ProjectChartAsset } from "@/contracts/figure";
import {
  buildFigureQaContinueNudge,
  buildReadFigureQaCall,
  checkFigureReplaceRequired,
  collectFigureQaFailures,
  extractFigureHref,
  extractFigureImageUrl,
  getMechanismTemplate,
  isFigureQaNeedsRegen,
  isMultiFigureGoal,
  isChartQaBlocked,
  isSchematicFigureId,
  lastFigureQaNeedsReplace,
  listMechanismTemplateIds,
  shouldInjectVisionFigureQa,
  resolveReplaceForAntiStack,
  shouldPauseForFigureBrief,
} from "@/lib/agent/figure-loop";
import type { ToolObservation } from "@/lib/agent/types";

describe("figure-loop", () => {
  it("extractFigureImageUrl / href from tool result", () => {
    expect(
      extractFigureImageUrl({
        success: true,
        data: { imageUrl: "/api/charts/abc.png", href: "/plot?id=1" },
      }),
    ).toBe("/api/charts/abc.png");
    expect(
      extractFigureHref({
        success: true,
        data: { href: "/plot?id=1&figure=flow" },
      }),
    ).toBe("/plot?id=1&figure=flow");
    expect(extractFigureImageUrl({ success: false, error: "x" })).toBeNull();
  });

  it("buildReadFigureQaCall uses args + qa mode", () => {
    const call = buildReadFigureQaCall("/api/charts/u.png");
    expect(call.name).toBe("read_figure");
    expect(call.args).toEqual({ imageUrl: "/api/charts/u.png", mode: "qa" });
  });

  it("isFigureQaNeedsRegen detects needsRegen / 结论", () => {
    expect(
      isFigureQaNeedsRegen({
        success: true,
        data: { needsRegen: true, mode: "qa" },
      }),
    ).toBe(true);
    expect(
      isFigureQaNeedsRegen({
        success: true,
        data: {
          mode: "qa",
          description: "结论：需重生成\n原因：Upload figure asset",
        },
      }),
    ).toBe(true);
    expect(
      isFigureQaNeedsRegen({
        success: true,
        data: { mode: "qa", description: "结论：可接受" },
      }),
    ).toBe(false);
    expect(
      isFigureQaNeedsRegen({
        success: true,
        data: { mode: "qa", description: "结论：可接受·建议精修" },
      }),
    ).toBe(false);
  });

  it("lastFigureQaNeedsReplace / checkFigureReplaceRequired", () => {
    const obs: ToolObservation[] = [
      {
        tool: "read_figure",
        success: true,
        data: {
          needsRegen: true,
          imageUrl: "/api/charts/old.png",
          mode: "qa",
        },
      },
    ];
    expect(lastFigureQaNeedsReplace(obs)).toEqual({
      imageUrl: "/api/charts/old.png",
    });
    expect(
      checkFigureReplaceRequired({
        toolName: "draft_mechanism_figure",
        params: { title: "图1" },
        observations: obs,
      }).ok,
    ).toBe(false);
    expect(
      checkFigureReplaceRequired({
        toolName: "draft_mechanism_figure",
        params: { replaceImageUrl: "/api/charts/old.png" },
        observations: obs,
      }).ok,
    ).toBe(true);
    expect(
      checkFigureReplaceRequired({
        toolName: "search_literature",
        params: {},
        observations: obs,
      }).ok,
    ).toBe(true);
  });

  it("resolveReplaceForAntiStack auto-fills same caption", () => {
    const charts: ProjectChartAsset[] = [
      {
        id: "c1",
        figureId: "flow",
        caption: "概念框架图",
        imageUrl: "/api/charts/old.png",
        sectionKey: "introduction",
        createdAt: 1,
      },
    ];
    const r = resolveReplaceForAntiStack({
      params: { title: "概念框架图", sectionKey: "introduction" },
      charts,
    });
    expect(r.autoReplaced).toBe(true);
    expect(r.params.replaceImageUrl).toBe("/api/charts/old.png");
    expect(r.params.replaceChartId).toBe("c1");
  });

  it("shouldPauseForFigureBrief on multi-figure mechanism goals", () => {
    expect(
      shouldPauseForFigureBrief({
        toolName: "draft_mechanism_figure",
        params: {},
        goal: "重新画这几张机理图",
        messages: [],
      }),
    ).toBe(true);
    expect(
      shouldPauseForFigureBrief({
        toolName: "draft_mechanism_figure",
        params: { figureBriefConfirmed: "true" },
        goal: "重新画这几张机理图",
        messages: [],
      }),
    ).toBe(false);
    expect(
      shouldPauseForFigureBrief({
        toolName: "generate_chart",
        params: {},
        goal: "重新画这几张机理图",
        messages: [],
      }),
    ).toBe(false);
    expect(isMultiFigureGoal("画一张柱状图")).toBe(false);
  });

  it("mechanism templates exist with Chinese structure", () => {
    const ids = listMechanismTemplateIds();
    expect(ids.length).toBeGreaterThanOrEqual(4);
    const t = getMechanismTemplate("deoxygenation_paths");
    expect(t?.kind).toBe("mechanism_panel");
    expect(t?.panels?.length).toBeGreaterThanOrEqual(2);
    expect(t?.panels?.[0]?.steps?.[0]).toMatch(/含氧|前体|脱水/);
  });

  it("vision QA only for mechanism tools; data chart block is qaReport", () => {
    expect(shouldInjectVisionFigureQa("draft_mechanism_figure")).toBe(true);
    expect(shouldInjectVisionFigureQa("generate_chart")).toBe(false);
    expect(isSchematicFigureId("flow")).toBe(true);
    expect(isSchematicFigureId("bar_grouped")).toBe(false);
    expect(isChartQaBlocked({ blocked: true })).toBe(true);
    expect(isChartQaBlocked({ qaReport: { verdict: "pass" } })).toBe(false);
    expect(
      lastFigureQaNeedsReplace([
        {
          tool: "generate_chart",
          success: true,
          data: { blocked: true, imageUrl: "/api/charts/bad-bar.png" },
        },
      ]),
    ).toEqual({ imageUrl: "/api/charts/bad-bar.png" });
    expect(
      lastFigureQaNeedsReplace([
        {
          tool: "generate_chart",
          success: true,
          data: { imageUrl: "/api/charts/ok-bar.png", qaReport: { verdict: "pass" } },
        },
      ]),
    ).toBeNull();
    expect(
      lastFigureQaNeedsReplace([
        {
          tool: "draft_mechanism_figure",
          success: true,
          data: { blocked: true, imageUrl: "/api/charts/bad-flow.png" },
        },
      ]),
    ).toEqual({ imageUrl: "/api/charts/bad-flow.png" });
  });

  it("buildFigureQaContinueNudge forces replaceImageUrl", () => {
    const n = buildFigureQaContinueNudge("/api/charts/x.png");
    expect(n).toMatch(/质量未过线/);
    expect(n).toMatch(/禁止只写分析就收尾/);
    expect(n).toMatch(/replaceImageUrl="\/api\/charts\/x\.png"/);
  });

  it("collectFigureQaFailures from parallel read_figure batch", () => {
    const fails = collectFigureQaFailures([
      {
        tool: "read_figure",
        success: true,
        data: { needsRegen: false, imageUrl: "/api/charts/ok.png" },
      },
      {
        tool: "read_figure",
        success: true,
        data: { needsRegen: true, imageUrl: "/api/charts/bad.png" },
      },
      { tool: "inspect_project", success: true },
    ]);
    expect(fails).toEqual(["/api/charts/bad.png"]);
  });
});
