import { describe, expect, it } from "vitest";
import {
  evaluateBibOnlyPreciseData,
  extractPreciseData,
  formatBibOnlyPreciseWarning,
} from "@/lib/agent/precise-data-grounding";

describe("extractPreciseData", () => {
  it("hits percent, temperature, and numeric+unit", () => {
    expect(extractPreciseData("产量提升 37%")).toContain("37%");
    expect(extractPreciseData("反应温度 800 ℃")).toContain("800 ℃");
    expect(extractPreciseData("比表面积 256.3 mg/g")).toContain("256.3 mg/g");
    expect(extractPreciseData("粒径 20 nm")).toContain("20 nm");
    expect(extractPreciseData("浓度 0.5 mol/L")).toContain("0.5 mol/L");
  });

  it("ignores bare years, citation numbers, and plain counts", () => {
    expect(extractPreciseData("in 2020, the yield")).toEqual([]);
    expect(extractPreciseData("见 [3] 与 [5]")).toEqual([]);
    expect(extractPreciseData("共 3 篇文献")).toEqual([]);
    expect(extractPreciseData("第 2 章")).toEqual([]);
  });

  it("ignores plain decimals and bare integers without a unit", () => {
    expect(extractPreciseData("增长 3.5 倍")).toEqual([]);
    expect(extractPreciseData("有 12 个样本")).toEqual([]);
  });

  it("does not truncate compound units with a trailing letter", () => {
    // "3 groups" 里 g 后面是字母，不应误判为 g 单位
    expect(extractPreciseData("3 groups were used")).toEqual([]);
  });
});

describe("evaluateBibOnlyPreciseData", () => {
  it("flags bib_only refs whose sentence carries precise data", () => {
    const draft = "炭化温度升高使产率降至 42.5%[1]。";
    const findings = evaluateBibOnlyPreciseData({
      draftText: draft,
      bibOnlyIndexes: new Set([1]),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ number: 1 });
    expect(findings[0]?.data).toContain("42.5%");
  });

  it("skips refs that are not bib_only", () => {
    const draft = "炭化温度升高使产率降至 42.5%[1]。";
    const findings = evaluateBibOnlyPreciseData({
      draftText: draft,
      bibOnlyIndexes: new Set([2]), // [1] 有摘要/全文，不告警
    });
    expect(findings).toEqual([]);
  });

  it("skips bib_only refs whose sentence has no precise data", () => {
    const draft = "该现象已有报道[1]。";
    const findings = evaluateBibOnlyPreciseData({
      draftText: draft,
      bibOnlyIndexes: new Set([1]),
    });
    expect(findings).toEqual([]);
  });
});

describe("formatBibOnlyPreciseWarning", () => {
  it("returns empty for no findings", () => {
    expect(formatBibOnlyPreciseWarning([])).toBe("");
  });

  it("summarizes findings without blocking wording", () => {
    const text = formatBibOnlyPreciseWarning([
      { number: 3, data: ["40%"], sentence: "提高 40%[3]。" },
    ]);
    expect(text).toMatch(/\[3\]/);
    expect(text).toMatch(/40%/);
    expect(text).toMatch(/不阻断导出/);
  });
});
