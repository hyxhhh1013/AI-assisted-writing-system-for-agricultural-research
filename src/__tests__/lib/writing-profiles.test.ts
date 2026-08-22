import { describe, expect, it } from "vitest";
import { collectWritingProfileFindings } from "@/lib/agent/writing-profiles";
import { applyWritingPatches } from "@/lib/agent/writing-patches";

describe("WRITE-QA-010 profiles", () => {
  it("introduction warns when gap sentence is missing", () => {
    const findings = collectWritingProfileFindings({
      sectionKey: "introduction",
      text: "生物炭能改良土壤结构与养分保持。热解温度影响产率与元素赋存形态。本文考察五个温度梯度下的迁移规律。",
    });
    expect(findings.some((f) => f.code === "intro_gap_missing")).toBe(true);
  });

  it("literature_body repairs 本研究 trial voice", () => {
    const text = "本研究田间试验表明处理组产量显著高于对照。小区设置三个重复。";
    const findings = collectWritingProfileFindings({
      sectionKey: "literature_body",
      subsectionTitle: "生物炭与有机碳",
      text,
    });
    expect(findings.some((f) => f.code === "review_as_experiment")).toBe(true);
    const patched = applyWritingPatches(text, findings);
    expect(patched.draft).toContain("已有研究");
    expect(patched.draft).not.toContain("本研究");
  });

  it("results warns when there is no quantity", () => {
    const findings = collectWritingProfileFindings({
      sectionKey: "results",
      text: "处理组土壤颜色加深，团聚体看起来更加稳定，田间小区设置三个重复，未报告具体含量。",
    });
    expect(findings.some((f) => f.code === "results_no_quantity")).toBe(true);
  });
});
