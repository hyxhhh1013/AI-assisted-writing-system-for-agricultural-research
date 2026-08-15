import { describe, expect, it } from "vitest";
import {
  extractPeakTableFromParsed,
  findIngestedPeakTable,
  peaksMatchIngested,
} from "@/lib/agent/xrd-ingested-peaks";

describe("extractPeakTableFromParsed", () => {
  it("reads two_theta + fwhm columns", () => {
    const peaks = extractPeakTableFromParsed(
      ["two_theta", "fwhm", "intensity"],
      [
        ["28.4", "0.25", "100"],
        ["47.3", "0.30", "80"],
      ],
    );
    expect(peaks).toHaveLength(2);
    expect(peaks?.[0].two_theta).toBe(28.4);
    expect(peaks?.[0].fwhm).toBe(0.25);
  });

  it("returns null without theta column", () => {
    expect(extractPeakTableFromParsed(["yield", "sd"], [["1", "0.1"]])).toBeNull();
  });
});

describe("peaksMatchIngested", () => {
  const ingested = [
    { two_theta: 28.4, intensity: 0, relative_intensity: 100, fwhm: 0.25 },
  ];
  it("accepts matching proposed peaks", () => {
    expect(peaksMatchIngested([{ two_theta: 28.41, intensity: 0, relative_intensity: 100 }], ingested)).toBe(true);
  });
  it("rejects invented peak positions", () => {
    expect(peaksMatchIngested([{ two_theta: 9.9, intensity: 0, relative_intensity: 100 }], ingested)).toBe(false);
  });
});

describe("findIngestedPeakTable", () => {
  it("finds peakTable on a source", () => {
    const hit = findIngestedPeakTable([
      {
        fileName: "peaks.csv",
        rowCount: 1,
        columns: [],
        stats: [],
        generatedAt: 1,
        peakTable: [{ two_theta: 26.6, fwhm: 0.2 }],
      },
    ]);
    expect(hit?.peaks[0].two_theta).toBe(26.6);
  });
});
