import { describe, expect, it } from "vitest";
import type { ArgumentBlueprint } from "@/contracts/argument-blueprint";
import {
  applyArgumentSectionHintToContext,
  findClaimsForSection,
  formatArgumentGlobalSummary,
  formatArgumentSectionHint,
} from "@/lib/argument-blueprint-utils";

const blueprint: ArgumentBlueprint = {
  version: 1,
  thesis: "生物炭提升盐碱地磷有效性",
  logicalFlow: "问题—机制—田间证据—局限",
  confirmedAt: 1,
  generatedAt: 1,
  claims: [
    {
      id: "c1",
      claim: "施用生物炭提高有效磷",
      evidence: ["温室试验", "田间验证"],
      sectionPath: "结果与分析 > 磷有效性",
      counterArgument: "长期效应未知",
      response: "需多年定位试验",
    },
    {
      id: "c2",
      claim: "机制与阳离子交换有关",
      evidence: ["CEC 数据"],
      sectionPath: "讨论",
    },
  ],
};

describe("argument-blueprint-utils", () => {
  it("matches claims by section path", () => {
    const hits = findClaimsForSection(blueprint, "结果与分析 > 磷有效性");
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe("c1");
  });

  it("formats section hint only when confirmed", () => {
    const hint = formatArgumentSectionHint(blueprint, "结果与分析 > 磷有效性");
    expect(hint).toContain("论证蓝图·本节");
    expect(hint).toContain("施用生物炭");
    const unconfirmed = formatArgumentSectionHint(
      { ...blueprint, confirmedAt: undefined },
      "结果与分析 > 磷有效性",
    );
    expect(unconfirmed).toBe("");
  });

  it("applies and strips section hints in context", () => {
    const base = "【扩写目标子节】：结果与分析 > 磷有效性";
    const next = applyArgumentSectionHintToContext(base, blueprint, "结果与分析 > 磷有效性");
    expect(next).toContain("论断：");
    const again = applyArgumentSectionHintToContext(next, blueprint, "结果与分析 > 磷有效性");
    expect(again.match(/论证蓝图·本节/g)?.length).toBe(1);
  });

  it("formats global summary with thesis and claims", () => {
    const summary = formatArgumentGlobalSummary(blueprint);
    expect(summary).toContain("核心论点");
    expect(summary).toContain("生物炭");
  });
});
