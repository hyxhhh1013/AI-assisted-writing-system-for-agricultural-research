import { describe, expect, it, vi } from "vitest";
import {
  collectCitedSentences,
  createLLMClaimJudge,
  evaluateCitationClaimGrounding,
  parseClaimVerdicts,
} from "@/lib/citation-claim-grounding";
import type {
  ClaimJudgeItem,
  ClaimSupportVerdict,
} from "@/contracts/citation-claim-grounding";

const LONG_ABS = (s: string) => `${s} ${"补充细节".repeat(20)}`;

const refs = [
  {
    index: 1,
    title: "Biochar improves saline soil",
    abstract: LONG_ABS("Biochar application improves soil fertility and crop yield in saline soils."),
  },
  {
    index: 2,
    title: "Pyrolysis temperature",
    abstract: LONG_ABS("Higher pyrolysis temperature reduces biochar yield but increases carbon stability."),
  },
  { index: 3, title: "No abstract", abstract: "x" },
];

const draft = "生物炭能提升盐碱地作物产量[1]。热解温度越高生物炭产率越高[2]。这句引用缺摘要[3]。";

describe("collectCitedSentences", () => {
  it("extracts one sentence per citation number (dedupe)", () => {
    const text = "生物炭提升产量[1]。另一句也提到[1]并再引[2]。";
    const out = collectCitedSentences(text, refs);
    expect(out.map((c) => c.number)).toEqual([1, 2]);
    expect(out[0].sentence).toContain("[1]");
    expect(out[1].ref?.title).toBe("Pyrolysis temperature");
  });
});

describe("parseClaimVerdicts", () => {
  const expected = [
    { number: 1, citedSentence: "a", refTitle: "t", refText: "r" },
    { number: 2, citedSentence: "b", refTitle: "t", refText: "r" },
  ];

  it("parses a valid JSON array and keeps unknown numbers as neutral", () => {
    const out = parseClaimVerdicts(
      '[{"number":1,"verdict":"support","reason":"ok"},{"number":2,"verdict":"contradict","reason":"bad"}]',
      expected,
    );
    expect(out.map((v) => v.verdict)).toEqual(["support", "contradict"]);
    expect(out[1].reason).toBe("bad");
  });

  it("falls back to neutral on malformed output", () => {
    const out = parseClaimVerdicts("garbage without json", expected);
    expect(out.map((v) => v.verdict)).toEqual(["neutral", "neutral"]);
  });

  it("coerces unknown verdict to neutral", () => {
    const out = parseClaimVerdicts(
      '[{"number":1,"verdict":"maybe","reason":"?"}]',
      [expected[0]],
    );
    expect(out[0].verdict).toBe("neutral");
  });
});

describe("evaluateCitationClaimGrounding", () => {
  it("judges only groundable refs and aggregates counts", async () => {
    const judge = vi.fn(async (items: ClaimJudgeItem[]) =>
      items.map((item) => ({
        number: item.number,
        verdict: (item.number === 2 ? "contradict" : "support") as ClaimSupportVerdict,
        reason: item.number === 2 ? "结论相反" : "文献支撑",
      })),
    );

    const report = await evaluateCitationClaimGrounding(
      { draftText: draft, references: refs },
      judge,
    );

    expect(report.judgedCount).toBe(2);
    expect(report.skippedCount).toBe(1);
    expect(report.supportCount).toBe(1);
    expect(report.contradictCount).toBe(1);
    expect(report.neutralCount).toBe(0);
    expect(report.supportRate).toBe(0.5);
    expect(report.items).toHaveLength(2);
    expect(report.items.find((i) => i.number === 2)?.verdict).toBe("contradict");
    expect(report.hint).toContain("contradict");
  });

  it("returns supportRate null when nothing groundable", async () => {
    const judge = vi.fn(async () => []);
    const report = await evaluateCitationClaimGrounding(
      { draftText: "无引用句。", references: refs },
      judge,
    );
    expect(report.judgedCount).toBe(0);
    expect(report.supportRate).toBeNull();
    expect(judge).not.toHaveBeenCalled();
  });
});

describe("createLLMClaimJudge", () => {
  it("returns a judge that no-ops on empty input (no key required)", async () => {
    const judge = createLLMClaimJudge();
    await expect(judge([])).resolves.toEqual([]);
  });
});
