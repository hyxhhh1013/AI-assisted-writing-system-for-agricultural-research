import { describe, expect, it } from "vitest";
import { matchXrdPhases, resetPhaseCatalogCache } from "@/lib/xrd-phase-match";

describe("xrd-phase-match", () => {
  it("matches quartz-like peaks", () => {
    resetPhaseCatalogCache();
    const matches = matchXrdPhases(
      [
        { two_theta: 26.65, relative_intensity: 100 },
        { two_theta: 20.9, relative_intensity: 20 },
        { two_theta: 36.6, relative_intensity: 12 },
        { two_theta: 42.5, relative_intensity: 9 },
      ],
      { tolerance_deg: 0.3, top_k: 3 },
    );
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.phase_id).toBe("quartz");
    expect(matches[0]?.score).toBeGreaterThan(0.4);
  });

  it("returns empty for unrelated peaks", () => {
    resetPhaseCatalogCache();
    const matches = matchXrdPhases([{ two_theta: 5.1 }, { two_theta: 7.2 }], {
      tolerance_deg: 0.2,
    });
    expect(matches).toHaveLength(0);
  });
});
