import { describe, expect, it } from "vitest";
import type { SectionSpecV1 } from "@/contracts/section-spec";
import {
  buildSpecWriterDraft,
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
