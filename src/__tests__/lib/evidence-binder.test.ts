import { describe, expect, it } from "vitest";
import type { EvidenceClaim } from "@/contracts/data-source";
import type { SectionSpecV1 } from "@/contracts/section-spec";
import {
  bindSectionEvidence,
  buildBindableReferencePool,
  evidenceUnboundFinding,
  formatEvidenceBindHint,
  slimReferenceEvidenceForSpec,
} from "@/lib/agent/evidence-binder";

function spec(over: Partial<SectionSpecV1> = {}): SectionSpecV1 {
  return {
    version: 1,
    sectionKey: "introduction",
    register: "introduction",
    claimCards: [
      {
        id: "C1",
        claim: "生物炭提高土壤有机碳并改善团聚体稳定性",
        evidence: [],
      },
    ],
    constraints: { minChars: 400, maxChars: 2500 },
    assignedSourceIds: [],
    figureSlots: [],
    ...over,
  };
}

const biocharAbs =
  "田间试验表明生物炭施用后土壤有机碳含量显著上升，团聚体稳定性同步改善，对旱地培肥有参考价值。";

const riceAbs =
  "水稻全基因组测序揭示了籼粳分化的分子基础，转录因子调控网络与产量性状相关，与炭基培肥无关。";

const dataClaim: EvidenceClaim = {
  id: "D1-C1",
  sourceId: "D1",
  sourceType: "data",
  type: "mean",
  text: "处理组土壤有机碳含量为 18.6 g/kg，显著高于对照",
  values: { mean: 18.6 },
  variables: ["土壤有机碳"],
  tolerance: 0.05,
};

describe("buildBindableReferencePool", () => {
  it("marks sourceName refs full and abstract-only refs soft; skips empty bib rows", () => {
    const pool = buildBindableReferencePool({
      referenceEvidence: [
        { index: 1, title: "Biochar soil", abstract: biocharAbs },
        { index: 2, title: "", abstract: "短" },
      ],
      referenceSourceNames: [{ refIndex: 1, sourceName: "biochar.pdf" }],
      references: ["Zhang 2020 生物炭与土壤", "短"],
    });
    expect(pool).toHaveLength(1);
    expect(pool[0]).toMatchObject({ n: 1, grounded: "full", sourceName: "biochar.pdf" });
  });

  it("uses bibliography line when a PDF is linked but no abstract row exists", () => {
    const pool = buildBindableReferencePool({
      referenceSourceNames: [{ refIndex: 3, sourceName: "field.pdf" }],
      references: ["", "", "Wang 2021 生物炭田间试验与土壤有机碳"],
    });
    expect(pool).toHaveLength(1);
    expect(pool[0]?.grounded).toBe("full");
    expect(pool[0]?.n).toBe(3);
  });
});

describe("bindSectionEvidence", () => {
  it("binds 1–3 overlapping refs and does not attach the unrelated paper", () => {
    const result = bindSectionEvidence({
      spec: spec(),
      referenceEvidence: [
        { index: 1, title: "生物炭与土壤有机碳", abstract: biocharAbs },
        { index: 2, title: "水稻基因组", abstract: riceAbs },
      ],
      referenceSourceNames: [{ refIndex: 1, sourceName: "biochar.pdf" }],
    });
    const refs = result.spec.claimCards[0]?.evidence.filter((e) => e.kind === "ref") ?? [];
    expect(refs.map((e) => e.n)).toEqual([1]);
    expect(refs[0]).toMatchObject({ grounded: "full" });
    expect(result.selectedSourceIds).toEqual(["biochar.pdf"]);
    expect(result.unboundCardIds).toEqual([]);
    expect(result.boundRefCount).toBe(1);
  });

  it("leaves unmatched cards unbound and records evidence_unbound only when a pool exists", () => {
    const result = bindSectionEvidence({
      spec: spec({
        claimCards: [{ id: "C1", claim: "量子计算纠错码的拓扑不变量", evidence: [] }],
      }),
      referenceEvidence: [{ index: 1, title: "生物炭与土壤有机碳", abstract: biocharAbs }],
    });
    expect(result.unboundCardIds).toEqual(["C1"]);
    expect(result.spec.claimCards[0]?.evidence).toEqual([]);
    const finding = evidenceUnboundFinding(result.unboundCardIds, {
      hadBindablePool: result.hadBindablePool,
    });
    expect(finding?.code).toBe("evidence_unbound");
    expect(evidenceUnboundFinding(["C1"], { hadBindablePool: false })).toBeNull();
  });

  it("binds results cards to overlapping dataClaims", () => {
    const result = bindSectionEvidence({
      spec: spec({
        sectionKey: "results",
        register: "results",
        claimCards: [
          { id: "C1", claim: "处理组土壤有机碳含量高于对照", evidence: [] },
        ],
      }),
      dataClaims: [dataClaim],
    });
    expect(result.spec.claimCards[0]?.evidence).toEqual([{ kind: "data", id: "D1-C1" }]);
    expect(result.unboundCardIds).toEqual([]);
  });
});

describe("formatEvidenceBindHint / slimReferenceEvidenceForSpec", () => {
  it("writes a short table without abstracts", () => {
    const bound = bindSectionEvidence({
      spec: spec(),
      referenceEvidence: [{ index: 2, title: "生物炭与土壤有机碳", abstract: biocharAbs }],
    });
    const hint = formatEvidenceBindHint(bound.spec);
    expect(hint).toContain("【证据绑定】");
    expect(hint).toContain("[2]soft");
    expect(hint).not.toContain("旱地培肥");
    expect(hint.length).toBeLessThan(400);
  });

  it("keeps only bound abstracts for Writer", () => {
    const all = [
      { index: 1, title: "A", abstract: biocharAbs },
      { index: 2, title: "B", abstract: riceAbs },
    ];
    const bound = bindSectionEvidence({
      spec: spec(),
      referenceEvidence: all,
    });
    const slim = slimReferenceEvidenceForSpec(all, bound.spec);
    expect(slim.map((e) => e.index)).toEqual([1]);
  });
});
