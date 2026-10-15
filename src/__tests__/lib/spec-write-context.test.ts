import { describe, expect, it } from "vitest";
import type { SectionSpecV1 } from "@/contracts/section-spec";
import {
  buildSpecWriterDraft,
  describeSectionSpecRejection,
  parseWriteSectionSpec,
} from "@/lib/agent/spec-write-context";

const spec: SectionSpecV1 = {
  version: 1,
  sectionKey: "introduction",
  register: "introduction",
  claimCards: [
    {
      id: "C1",
      claim: "热解温度下营养元素保留率仍不清楚",
      evidence: [{ kind: "ref", n: 1, grounded: "full" }],
    },
  ],
  constraints: { minChars: 400, maxChars: 2500 },
  assignedSourceIds: [],
  figureSlots: [],
};

describe("WRITE-QA-009 spec writer context", () => {
  it("parses SectionSpec JSON and rejects junk", () => {
    expect(parseWriteSectionSpec(JSON.stringify(spec))?.sectionKey).toBe("introduction");
    expect(parseWriteSectionSpec("{nope}")).toBeNull();
    expect(parseWriteSectionSpec("")).toBeNull();
  });

  it("names missing SectionSpec fields when the model sends a blueprint guide", () => {
    const raw = JSON.stringify({
      sectionPath: "研究现状与问题",
      claim: "接口缺失",
      keyPoints: ["跨尺度"],
      evidenceHint: "泛化表述",
    });
    expect(parseWriteSectionSpec(raw)).toBeNull();
    const message = describeSectionSpecRejection(raw);
    expect(message).toContain("蓝图节字段");
    expect(message).toContain("claimCards");
    expect(message).toContain("sectionKey");
  });

  it("builds Writer draft from spec, not raw context", () => {
    const draft = buildSpecWriterDraft({
      spec,
      context: "用户补充一句",
      source: "provided",
    });
    expect(draft).toContain("【本节主张】");
    expect(draft).toContain("C1");
    expect(draft).toContain("【证据绑定】");
    expect(draft).toContain("【补充说明】用户补充一句");
    expect(draft).not.toContain("另起炉灶的长 context 堆");
  });
});
