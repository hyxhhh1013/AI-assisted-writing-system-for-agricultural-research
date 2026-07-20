import { describe, it, expect } from "vitest";
import {
  validateParaphraseComplete,
  suggestParaphrasesFromAnswers,
  computePreCommitmentReadiness,
} from "@/lib/direction-pre-commitment";
import type { DirectionAsset } from "@/contracts/direction";

const baseExp = (): DirectionAsset => ({
  id: "exp-1",
  kind: "experiment",
  title: "热解实验",
  dateRange: "2024-Q1",
  researchQuestion: "CO2 对产率的影响？",
  methods: "管式炉",
  keyFindings: "产率提高 12%",
  limitations: "单次重复",
  isNegativeResult: false,
  linkedDatasets: [],
  linkedPapers: [],
  createdAt: 1,
  updatedAt: 1,
});

describe("validateParaphraseComplete", () => {
  it("requires at least 4 dimensions with 8+ chars", () => {
    const partial = { D1: "足够长的复述内容", D2: "足够长的复述内容" };
    expect(validateParaphraseComplete(partial).ok).toBe(false);
    const ok = {
      D1: "足够长的复述内容一",
      D2: "足够长的复述内容二",
      D3: "足够长的复述内容三",
      D4: "足够长的复述内容四",
    };
    expect(validateParaphraseComplete(ok).ok).toBe(true);
  });
});

describe("suggestParaphrasesFromAnswers", () => {
  it("maps journal tier answer to D7", () => {
    const s = suggestParaphrasesFromAnswers({
      q1: "Q1-Q2 区（IF 4-8）",
      q2: "3",
    });
    expect(s.D7).toContain("Q1-Q2");
    expect(s.D4).toContain("3");
  });
});

describe("computePreCommitmentReadiness", () => {
  it("is not ready until evaluation contract is confirmed", () => {
    const r = computePreCommitmentReadiness([baseExp()]);
    expect(r.ready).toBe(false);
    expect(r.hasConfirmedContract).toBe(false);
    expect(r.checks.find((c) => c.id === "contract_confirmed")?.passed).toBe(false);
    expect(r.checks.find((c) => c.id === "assets_ready")).toBeUndefined();
  });
});
