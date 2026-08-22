import { describe, expect, it } from "vitest";
import { buildWriterSystemPrompt } from "@/lib/prompts/writing";
import {
  buildSlimWriterSystemPrompt,
  resolveSlimSectionPrompt,
} from "@/lib/agent/writer-prompt";

const shared = {
  section: "introduction",
  domainExpertise: "农业土壤。",
  globalReferenceInfo: "【论文大纲】\n1. 引言\n2. 方法",
  language: "zh",
  contextText: "[参考来源 [1]] 生物炭与土壤",
  sectionInstruction: "按五步写引言。",
};

describe("WRITE-QA-007 slim writer prompt", () => {
  it("is much shorter than legacy and drops ban-list / FIGURE dumps", () => {
    const slim = buildSlimWriterSystemPrompt(shared);
    const legacy = buildWriterSystemPrompt({
      ...shared,
      template: "sci",
      figureStart: 1,
      projectMode: "research",
      citationStyle: "gbt7714",
    });
    expect(slim.length).toBeLessThan(legacy.length * 0.45);
    expect(slim.length).toBeLessThan(2200);
    expect(slim).toContain("【证据绑定】");
    expect(slim).toContain("hollow_phrase");
    expect(slim).toContain("number_not_in_claims");
    expect(slim).not.toContain("具有重要的意义");
    expect(slim).not.toContain("【FIGURE:");
    expect(slim).not.toContain("随着…的发展");
    expect(slim).not.toContain("GB/T 7714-2015");
  });

  it("keeps register craft without long 禁止 lists", () => {
    const results = resolveSlimSectionPrompt("results", "research", {
      isGBT: false,
      isChinese: true,
    });
    expect(results).toContain("过去时");
    expect(results).toContain("可能反映");
    expect(results.length).toBeLessThan(120);

    const abs = resolveSlimSectionPrompt("abstract", "research", {
      isGBT: false,
      isChinese: true,
    });
    expect(abs).toContain("不要 [n]");
  });
});
