import { describe, expect, it } from "vitest";
import type { DataSourceAnalysis, EvidenceClaim } from "@/contracts/data-source";
import {
  parseDataClaims,
  parseDataSources,
  serializeDataClaims,
  serializeDataSources,
} from "@/contracts/project";

const validClaim: EvidenceClaim = {
  id: "D1-C1",
  sourceId: "D1",
  sourceType: "data",
  type: "mean",
  text: "处理组均值 12.3 g",
  values: { mean: 12.3 },
  variables: ["yield"],
  tolerance: 0.05,
};

describe("parseDataClaims", () => {
  it("returns empty array when field missing", () => {
    expect(parseDataClaims({})).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseDataClaims({ dataClaims: "{bad json" })).toEqual([]);
  });

  it("filters invalid claim entries", () => {
    const raw = JSON.stringify([validClaim, { id: "x" }, null, "bad"]);
    expect(parseDataClaims({ dataClaims: raw })).toEqual([validClaim]);
  });

  it("round-trips via serializeDataClaims", () => {
    const json = serializeDataClaims([validClaim]);
    expect(parseDataClaims({ dataClaims: json })).toEqual([validClaim]);
  });
});

describe("parseDataSources", () => {
  it("returns empty array when field missing", () => {
    expect(parseDataSources({})).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    expect(parseDataSources({ dataSources: JSON.stringify({ fileName: "a.csv" }) })).toEqual([]);
  });

  it("parses valid analysis entries", () => {
    const source: DataSourceAnalysis = {
      fileName: "trial.csv",
      rowCount: 10,
      columns: [{ name: "yield", type: "numeric", count: 10 }],
      stats: [],
      generatedAt: 1,
    };
    const json = serializeDataSources([source]);
    expect(parseDataSources({ dataSources: json })).toEqual([source]);
  });
});
