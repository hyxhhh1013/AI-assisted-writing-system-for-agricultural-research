import { describe, expect, it } from "vitest";
import {
  mergePackWithSlimEvidence,
  readingPackGateError,
  recordReferenceRead,
  resolveRefIndexBySourceKey,
  fullReadBudgetError,
} from "@/lib/agent/reading-pack";
import type { SectionSpecV1 } from "@/contracts/section-spec";

const abs =
  "田间试验表明生物炭施用后土壤有机碳含量显著上升，团聚体稳定性同步改善，对旱地培肥有参考价值。";

describe("reading-pack", () => {
  it("resolves PDF basename to refIndex", () => {
    expect(
      resolveRefIndexBySourceKey("papers/Biochar.pdf", [
        { refIndex: 7, sourceName: "Biochar.pdf" },
      ]),
    ).toBe(7);
  });

  it("upgrades abstract read to full", () => {
    const ctx = { readingPack: [] as { n: number; depth: "abstract" | "full" }[] };
    recordReferenceRead(ctx, 3, "abstract");
    recordReferenceRead(ctx, 3, "full", "a.pdf");
    expect(ctx.readingPack).toEqual([{ n: 3, depth: "full", sourceName: "a.pdf" }]);
  });

  it("gates introduction when many abstracts and few reads", () => {
    expect(
      readingPackGateError({ section: "introduction", withAbstract: 12, packCount: 1 }),
    ).toContain("read_reference");
    expect(
      readingPackGateError({ section: "introduction", withAbstract: 12, packCount: 4 }),
    ).toBeNull();
    expect(
      readingPackGateError({ section: "methods", withAbstract: 40, packCount: 0 }),
    ).toBeNull();
    expect(
      readingPackGateError({ section: "literature_body", withAbstract: 12, packCount: 4 }),
    ).toBeNull();
  });

  it("caps slice writer evidence so a full pack is not dumped every subsection", () => {
    const spec: SectionSpecV1 = {
      version: 1,
      sectionKey: "literature_body",
      register: "review_body",
      claimCards: [
        {
          id: "C1",
          claim: "生物炭提高土壤有机碳",
          evidence: [{ kind: "ref", n: 1, grounded: "soft" }],
        },
      ],
      constraints: { minChars: 220, maxChars: 560 },
      assignedSourceIds: [],
      figureSlots: [],
    };
    const all = Array.from({ length: 12 }, (_, i) => ({
      index: i + 1,
      title: `T${i + 1}`,
      abstract: abs,
    }));
    const pack = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const merged = mergePackWithSlimEvidence(all, spec, pack, { slice: true });
    expect(merged.length).toBeLessThanOrEqual(5);
  });

  it("prefers pack abstracts over slim-only first-n bind", () => {
    const spec: SectionSpecV1 = {
      version: 1,
      sectionKey: "introduction",
      register: "introduction",
      claimCards: [
        {
          id: "C1",
          claim: "生物炭提高土壤有机碳",
          evidence: [{ kind: "ref", n: 1, grounded: "soft" }],
        },
      ],
      constraints: { minChars: 400, maxChars: 2500 },
      assignedSourceIds: [],
      figureSlots: [],
    };
    const all = [
      { index: 1, title: "A", abstract: abs },
      { index: 12, title: "L", abstract: abs },
    ];
    const merged = mergePackWithSlimEvidence(all, spec, new Set([12]));
    expect(merged.map((e) => e.index)).toContain(12);
    expect(merged.map((e) => e.index)).toContain(1);
  });

  it("blocks a fifth full-text read in the same session", () => {
    const ctx = { readingPack: [] as { n: number; depth: "abstract" | "full" }[] };
    for (let n = 1; n <= 4; n++) recordReferenceRead(ctx, n, "full", `${n}.pdf`);
    expect(fullReadBudgetError(ctx)).toContain("4 篇上限");
    recordReferenceRead(ctx, 5, "full", "5.pdf");
    expect(ctx.readingPack).toHaveLength(4);
  });
});
