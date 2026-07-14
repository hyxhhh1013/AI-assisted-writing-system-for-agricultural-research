import { describe, it, expect } from "vitest";
import {
  computeAssetInventoryHealth,
  computeAssetFieldCompleteness,
  isAssetAlreadyImported,
} from "@/lib/direction-asset-health";
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

describe("computeAssetFieldCompleteness", () => {
  it("returns 100 for fully filled experiment", () => {
    expect(computeAssetFieldCompleteness(baseExp())).toBeGreaterThanOrEqual(80);
  });

  it("returns lower score for sparse experiment", () => {
    const sparse = { ...baseExp(), methods: "", limitations: "", dateRange: "" };
    expect(computeAssetFieldCompleteness(sparse)).toBeLessThan(computeAssetFieldCompleteness(baseExp()));
  });
});

describe("computeAssetInventoryHealth", () => {
  it("blocks next phase when fewer than 3 assets", () => {
    const health = computeAssetInventoryHealth([baseExp()]);
    expect(health.readyForNextPhase).toBe(false);
    expect(health.checks.find((c) => c.id === "min_assets")?.passed).toBe(false);
  });

  it("passes high checks with 3 complete assets including experiment", () => {
    const assets: DirectionAsset[] = [
      baseExp(),
      {
        id: "paper-1",
        kind: "paper",
        doi: "10.1000/test",
        title: "Test paper",
        journal: "J",
        year: 2024,
        abstract: "",
        contribution: "建立了方法学基础",
        linkedExperiments: ["exp-1"],
        source: "manual",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "ds-1",
        kind: "dataset",
        title: "GC-MS 数据",
        variables: "温度, 产率",
        linkedExperiments: ["exp-1"],
        source: "manual",
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const health = computeAssetInventoryHealth(assets);
    expect(health.readyForNextPhase).toBe(true);
    expect(health.stats.total).toBe(3);
  });
});

describe("isAssetAlreadyImported", () => {
  it("matches by DOI", () => {
    const existing: DirectionAsset[] = [{
      id: "p1",
      kind: "paper",
      doi: "10.1000/abc",
      title: "A",
      journal: "",
      year: 2020,
      abstract: "",
      contribution: "x",
      linkedExperiments: [],
      source: "manual",
      createdAt: 1,
      updatedAt: 1,
    }];
    expect(isAssetAlreadyImported({ doi: "10.1000/abc", title: "Other" }, existing)).toBe(true);
    expect(isAssetAlreadyImported({ doi: "10.1000/xyz", title: "A" }, existing)).toBe(true);
  });
});
