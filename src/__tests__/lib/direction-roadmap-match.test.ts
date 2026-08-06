import { describe, it, expect } from "vitest";
import {
  resolveCandidateForRoadmapPaper,
  canStartWritingFromRoadmap,
} from "@/lib/direction-roadmap-match";
import type { PaperCandidate } from "@/contracts/direction";

const candidates: PaperCandidate[] = [
  {
    id: "pc-abc",
    title: "热解产物对土壤碳的影响",
    tier: "ready",
    dimensionScores: {},
    overallScore: 8,
    requiredExperiments: [],
    estimatedCompletion: "2026-Q3",
  },
  {
    id: "pc-def",
    title: "生物炭改良机制综述",
    tier: "long_term",
    dimensionScores: {},
    overallScore: 5,
    requiredExperiments: ["补 SEM"],
    estimatedCompletion: "2027-Q1",
  },
];

describe("resolveCandidateForRoadmapPaper", () => {
  it("matches by exact id", () => {
    expect(resolveCandidateForRoadmapPaper("pc-abc", candidates)?.title).toContain("热解");
  });

  it("matches candidate-1 placeholder to first candidate", () => {
    expect(resolveCandidateForRoadmapPaper("candidate-1", candidates)?.id).toBe("pc-abc");
  });

  it("matches by priority fallback", () => {
    const sorted = resolveCandidateForRoadmapPaper("unknown-id", candidates, 2);
    expect(sorted?.id).toBe("pc-def");
  });
});

describe("canStartWritingFromRoadmap", () => {
  it("allows planned without linked project", () => {
    expect(canStartWritingFromRoadmap({ status: "planned" })).toBe(true);
  });

  it("blocks when already linked", () => {
    expect(canStartWritingFromRoadmap({ status: "planned", linkedProjectId: "x" })).toBe(false);
  });
});
