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

  it("literature_body reports uncovered blueprint claims as repair", () => {
    const findings = collectWritingProfileFindings({
      sectionKey: "literature_body",
      text: "已有田间试验表明生物炭可提高土壤有机碳并改善团聚体。转述时需对照试验条件。",
      spec: {
        version: 1,
        sectionKey: "literature_body",
        register: "review_body",
        claimCards: [
          { id: "C1", claim: "生物炭可提高土壤有机碳并改善团聚体", evidence: [] },
          { id: "C2", claim: "不同热解温度下产率与孔隙差异明显", evidence: [] },
          { id: "C3", claim: "原料与保温时间在各研究间并不一致", evidence: [] },
        ],
        constraints: { minChars: 80, maxChars: 4000 },
        assignedSourceIds: [],
        figureSlots: [],
      },
    });
    const hit = findings.find((f) => f.code === "blueprint_claim_uncovered");
    expect(hit?.action).toBe("repair");
    expect(hit?.count).toBeGreaterThanOrEqual(2);
  });

  it("results warns when there is no quantity", () => {
    const findings = collectWritingProfileFindings({
      sectionKey: "results",
      text: "处理组土壤颜色加深，团聚体看起来更加稳定，田间小区设置三个重复，未报告具体含量。",
    });
    expect(findings.some((f) => f.code === "results_no_quantity")).toBe(true);
  });
});
