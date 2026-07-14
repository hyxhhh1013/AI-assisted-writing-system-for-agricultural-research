import { describe, it, expect } from "vitest";
import { computeAnalysisFingerprint, isAnalysisFingerprintStale } from "@/lib/direction-analysis-fingerprint";
import { applySynthesisAdjustments } from "@/lib/direction-analysis-synthesis";
import type { AnalysisDimension, PaperCandidate } from "@/contracts/direction";

const baseAsset = (id: string) => ({
  id,
  kind: "experiment" as const,
  title: "实验",
  dateRange: "2024",
  researchQuestion: "Q",
  methods: "M",
  keyFindings: "F",
  limitations: "L",
  isNegativeResult: false,
  linkedDatasets: [],
  linkedPapers: [],
  createdAt: 1,
  updatedAt: 1,
});

describe("computeAnalysisFingerprint", () => {
  it("changes when asset ids change", () => {
    const contract = { confirmedAt: 1, dimensions: [] };
    const fp1 = computeAnalysisFingerprint([baseAsset("a")], contract);
    const fp2 = computeAnalysisFingerprint([baseAsset("b")], contract);
    expect(fp1).not.toBe(fp2);
  });

  it("detects stale analysis", () => {
    const assets = [baseAsset("a"), baseAsset("b"), baseAsset("c")];
    const contract = { confirmedAt: 1, dimensions: [] };
    const fp = computeAnalysisFingerprint(assets, contract);
    const analysis = {
      generatedAt: 1,
      analysisFingerprint: fp,
      dimensions: [],
      paperCandidates: [],
      crossDirectionOpportunities: [],
      evaluationContract: contract,
    };
    expect(isAnalysisFingerprintStale(assets, analysis)).toBe(false);
    expect(isAnalysisFingerprintStale([...assets, baseAsset("d")], analysis)).toBe(true);
  });
});

describe("applySynthesisAdjustments", () => {
  const dim = (id: string, score: number): AnalysisDimension => ({
    id,
    name: id,
    weight: 0.1,
    score,
    summary: "s",
    whatTriggersBlock: "",
    whatTriggersWarn: "",
    confidence: "medium",
  });

  it("applies adjusted scores and downgrades ready candidates on D4-D5 high conflict", () => {
    const dimensions = [dim("D4", 8), dim("D5", 7)];
    const candidates: PaperCandidate[] = [{
      id: "p1",
      title: "T",
      tier: "ready",
      dimensionScores: {},
      overallScore: 8,
      requiredExperiments: [],
      estimatedCompletion: "2026-Q2",
    }];
    const result = applySynthesisAdjustments(dimensions, candidates, {
      contradictions: [{
        pair: ["D4", "D5"],
        severity: "high",
        description: "冲突",
        resolution: "降级",
        adjustedScores: { D4: 4 },
      }],
      harmonizedScore: 6,
      summary: "ok",
    });
    expect(result.dimensions.find((d) => d.id === "D4")?.score).toBe(4);
    expect(result.candidates[0].tier).toBe("needs_experiment");
  });
});
