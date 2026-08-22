import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent/writing-runner", () => ({
  runAgentRefineContent: vi.fn(),
}));

import { runAgentRefineContent } from "@/lib/agent/writing-runner";
import { repairSectionDraft } from "@/lib/agent/writing-patch-run";

const mockedRefine = vi.mocked(runAgentRefineContent);

describe("repairSectionDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears deterministic defects without calling refine", async () => {
    const draft =
      "众所周知，该方法具有重要的意义。值得注意的是，它也展现出较大的潜力。田间试验设置三个温度水平。";
    const out = await repairSectionDraft({
      draft,
      sectionKey: "introduction",
      maxRefIndex: 0,
      userId: "u1",
      signal: new AbortController().signal,
      allowRefine: true,
    });
    expect(mockedRefine).not.toHaveBeenCalled();
    expect(out.refined).toBe(false);
    expect(out.patches.length).toBeGreaterThan(0);
    expect(out.draft).not.toContain("众所周知");
    expect(out.qaReport.findings.some((f) => f.action === "repair")).toBe(false);
  });

  it("calls refine at most once when a repair finding remains", async () => {
    mockedRefine.mockResolvedValue({
      draft: "生物炭施用后土壤有机碳储量上升。田间试验设置三个温度水平。",
      charCount: 30,
    });
    const out = await repairSectionDraft({
      draft: "编号与题录不对齐的句子见[3]。田间试验设置三个温度水平。",
      sectionKey: "introduction",
      extraFindings: [
        {
          code: "cite_semantic_mismatch",
          layer: "L3",
          action: "repair",
          message: "编号与题录不对齐",
          examples: ["[3]"],
        },
      ],
      maxRefIndex: 2,
      userId: "u1",
      signal: new AbortController().signal,
      allowRefine: true,
    });
    expect(mockedRefine).toHaveBeenCalledTimes(1);
    const feedback = mockedRefine.mock.calls[0]?.[0]?.feedback ?? "";
    expect(feedback).toContain("cite_semantic_mismatch");
    expect(feedback).not.toContain("请根据以下审查意见");
    expect(out.refined).toBe(true);
  });

  it("skips refine when allowRefine is false", async () => {
    await repairSectionDraft({
      draft: "编号不对齐见[3]。田间试验设置三个温度水平。",
      sectionKey: "introduction",
      extraFindings: [
        {
          code: "cite_semantic_mismatch",
          layer: "L3",
          action: "repair",
          message: "编号与题录不对齐",
        },
      ],
      maxRefIndex: 2,
      userId: "u1",
      signal: new AbortController().signal,
      allowRefine: false,
    });
    expect(mockedRefine).not.toHaveBeenCalled();
  });
});
