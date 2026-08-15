import { describe, expect, it, vi } from "vitest";
import {
  isCitationClaimGroundingCloseOut,
  shouldRunCitationClaimGrounding,
} from "@/lib/agent/citation-claim-policy";
import { evaluateCitationClaimGrounding } from "@/lib/citation-claim-grounding";
import type { ClaimJudgeItem } from "@/contracts/citation-claim-grounding";

describe("isCitationClaimGroundingCloseOut", () => {
  it("treats citation / apply / abstract / review / AP kinds as close-out", () => {
    expect(isCitationClaimGroundingCloseOut("写引言", "citation")).toBe(true);
    expect(isCitationClaimGroundingCloseOut("A", "citation_apply")).toBe(true);
    expect(isCitationClaimGroundingCloseOut("好", "abstract_finish")).toBe(true);
    expect(isCitationClaimGroundingCloseOut("继续", "review_request")).toBe(true);
    expect(isCitationClaimGroundingCloseOut("写方法", "ap_full")).toBe(true);
    expect(isCitationClaimGroundingCloseOut("x", "pipeline_check")).toBe(true);
  });

  it("skips draft / literature / review_write even if goal text looks like a check", () => {
    expect(isCitationClaimGroundingCloseOut("检查引用", "draft")).toBe(false);
    expect(isCitationClaimGroundingCloseOut("检索 10 篇", "literature")).toBe(false);
    expect(isCitationClaimGroundingCloseOut("写综述", "review_write")).toBe(false);
  });

  it("falls back to goal regex when kind is missing", () => {
    expect(isCitationClaimGroundingCloseOut("检查引用编号对不对")).toBe(true);
    expect(isCitationClaimGroundingCloseOut("写引言")).toBe(false);
    expect(isCitationClaimGroundingCloseOut("")).toBe(true);
  });
});

describe("shouldRunCitationClaimGrounding", () => {
  it("defaults on when close-out and abstracts exist (env unset)", () => {
    expect(
      shouldRunCitationClaimGrounding({
        hasAbstracts: true,
        closeOut: true,
        env: undefined,
      }),
    ).toBe(true);
  });

  it("turns off with 0 / false / off", () => {
    for (const env of ["0", "false", "off", "FALSE"]) {
      expect(
        shouldRunCitationClaimGrounding({ hasAbstracts: true, closeOut: true, env }),
      ).toBe(false);
    }
  });

  it("skips when no abstracts or not close-out", () => {
    expect(
      shouldRunCitationClaimGrounding({
        hasAbstracts: false,
        closeOut: true,
        env: undefined,
      }),
    ).toBe(false);
    expect(
      shouldRunCitationClaimGrounding({
        hasAbstracts: true,
        closeOut: false,
        env: undefined,
      }),
    ).toBe(false);
  });

  it("still invokes fake judge when default-on close-out path is taken", async () => {
    const closeOut = isCitationClaimGroundingCloseOut("检查引用", "citation");
    const should = shouldRunCitationClaimGrounding({
      hasAbstracts: true,
      closeOut,
    });
    expect(should).toBe(true);

    const judge = vi.fn(async (items: ClaimJudgeItem[]) =>
      items.map((item) => ({
        number: item.number,
        verdict: "support" as const,
        reason: "ok",
      })),
    );
    await evaluateCitationClaimGrounding(
      {
        draftText: "生物炭能提升盐碱地作物产量[1]。",
        references: [
          {
            index: 1,
            title: "Biochar improves saline soil",
            abstract: `${"补充细节".repeat(20)} Biochar application improves crop yield.`,
          },
        ],
      },
      judge,
    );
    expect(judge).toHaveBeenCalled();
  });
});
