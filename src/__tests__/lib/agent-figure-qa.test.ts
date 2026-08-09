import { describe, expect, it } from "vitest";
import {
  buildFigureQaPolishNudge,
  parseFigureQaVerdict,
} from "@/lib/agent/figure-qa";
import {
  isFigureQaNeedsPolish,
  isFigureQaNeedsRegen,
} from "@/lib/agent/figure-loop";

describe("parseFigureQaVerdict", () => {
  it("detects hard-fail regen", () => {
    expect(parseFigureQaVerdict("1. 占位：Upload figure asset\n结论：需重生成")).toEqual({
      verdict: "regen",
      needsRegen: true,
      needsPolish: false,
    });
    expect(parseFigureQaVerdict("出现 Feedstock\n结论：可接受")).toMatchObject({
      verdict: "regen",
      needsRegen: true,
    });
  });

  it("detects polish tier without forcing regen", () => {
    const r = parseFigureQaVerdict(
      "1. 无\n7. 个别节点略长\n结论：可接受·建议精修",
    );
    expect(r).toEqual({
      verdict: "polish",
      needsRegen: false,
      needsPolish: true,
    });
    expect(
      isFigureQaNeedsPolish({
        success: true,
        data: { mode: "qa", description: r.verdict === "polish" ? "结论：可接受·建议精修" : "" },
      }),
    ).toBe(true);
    expect(
      isFigureQaNeedsRegen({
        success: true,
        data: { mode: "qa", description: "结论：可接受·建议精修" },
      }),
    ).toBe(false);
  });

  it("detects clean pass", () => {
    expect(parseFigureQaVerdict("1. 无\n结论：可接受")).toEqual({
      verdict: "pass",
      needsRegen: false,
      needsPolish: false,
    });
  });

  it("ambiguous text defaults to polish not pass", () => {
    expect(parseFigureQaVerdict("画面大致清楚，建议加点分叉")).toEqual({
      verdict: "polish",
      needsRegen: false,
      needsPolish: true,
    });
  });

  it("polish nudge mentions plot refine", () => {
    expect(buildFigureQaPolishNudge("/api/charts/a.png")).toMatch(/绘图页精修/);
    expect(buildFigureQaPolishNudge()).toMatch(/不必强制/);
  });
});
