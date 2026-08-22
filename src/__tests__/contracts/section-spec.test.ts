import { describe, expect, it } from "vitest";
import {
  defaultConstraintsFor,
  liftWriteSectionInputToSpec,
  parseSectionSpec,
  registerFromSectionKey,
  sectionGuideToClaimCards,
  sectionSpecToWriteDraft,
  type SectionSpecV1,
} from "@/contracts/section-spec";

function sampleSpec(over: Partial<SectionSpecV1> = {}): SectionSpecV1 {
  return {
    version: 1,
    sectionKey: "results",
    register: "results",
    claimCards: [
      {
        id: "C1",
        claim: "600°C 处理下比表面积最高",
        evidence: [{ kind: "data", id: "D1-C3" }],
      },
    ],
    constraints: {
      minChars: 900,
      maxChars: 3000,
      forbidDiscussionInResults: true,
    },
    assignedSourceIds: [],
    figureSlots: [],
    ...over,
  };
}

describe("SectionSpecV1", () => {
  it("parses a valid spec and rejects bad version/key", () => {
    expect(parseSectionSpec(sampleSpec())?.sectionKey).toBe("results");
    expect(parseSectionSpec({ ...sampleSpec(), version: 2 })).toBeNull();
    expect(parseSectionSpec({ ...sampleSpec(), sectionKey: "appendix" })).toBeNull();
    expect(
      parseSectionSpec({
        ...sampleSpec(),
        constraints: { minChars: 900, maxChars: 100 },
      }),
    ).toBeNull();
  });

  it("maps section keys to registers", () => {
    expect(registerFromSectionKey("results")).toBe("results");
    expect(registerFromSectionKey("literature_body")).toBe("review_body");
    expect(registerFromSectionKey("background")).toBe("review_body");
    expect(registerFromSectionKey("unknown")).toBeNull();
  });

  it("caps subsection max chars so综述子节不会按整章预算", () => {
    const whole = defaultConstraintsFor("review_body");
    const sub = defaultConstraintsFor("review_body", { subsectionTitle: "2.1 孔隙结构" });
    expect(sub.maxChars).toBeLessThanOrEqual(2500);
    expect(sub.maxChars).toBeLessThan(whole.maxChars);
  });

  it("lifts bullets over context, and allows empty cards", () => {
    const fromBullets = liftWriteSectionInputToSpec({
      sectionKey: "introduction",
      bullets: ["缺口是机制不清", "  "],
      context: "这段应被忽略",
    });
    expect(fromBullets?.claimCards).toHaveLength(1);
    expect(fromBullets?.claimCards[0]?.claim).toBe("缺口是机制不清");
    expect(fromBullets?.register).toBe("introduction");

    const fromContext = liftWriteSectionInputToSpec({
      sectionKey: "methods",
      context: "盆栽试验，三水平施肥",
    });
    expect(fromContext?.claimCards[0]?.claim).toBe("盆栽试验，三水平施肥");

    const empty = liftWriteSectionInputToSpec({ sectionKey: "abstract" });
    expect(empty?.claimCards).toEqual([]);
    expect(empty?.constraints.forbidInlineCite).toBe(true);
    expect(liftWriteSectionInputToSpec({ sectionKey: "nope" })).toBeNull();
  });

  it("round-trips spec → bullets for the frozen expand_bullet path", () => {
    const spec = parseSectionSpec(sampleSpec({ subsectionTitle: "3.1 孔隙" }));
    expect(spec).not.toBeNull();
    const draft = sectionSpecToWriteDraft(spec!);
    expect(draft.bullets).toEqual(["600°C 处理下比表面积最高"]);
    expect(draft.context).toContain("3.1 孔隙");
  });

  it("lifts blueprint keyPoints into cards and keeps warrant on C1", () => {
    const cards = sectionGuideToClaimCards({
      claim: "整节主张（有要点时不用）",
      keyPoints: ["点 A", "点 B"],
      warrant: "因为数据呈单峰",
    });
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ id: "C1", claim: "点 A", warrant: "因为数据呈单峰" });
    expect(cards[1]?.warrant).toBeUndefined();
    expect(cards[0]?.evidence).toEqual([]);
  });
});
