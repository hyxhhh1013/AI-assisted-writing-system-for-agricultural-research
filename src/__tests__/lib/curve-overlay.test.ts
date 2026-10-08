import { describe, expect, it } from "vitest";
import {
  axisForOverlay,
  derivativeMass,
  overlayLongCsv,
  toDvDlog,
  toMassPercent,
} from "@/lib/agent/curve-overlay";

describe("curve overlay", () => {
  it("turns milligrams into percent of the first point", () => {
    const out = toMassPercent({ name: "10 °C/min", x: [30, 40], y: [10, 8] });
    expect(out.y[0]).toBeCloseTo(100);
    expect(out.y[1]).toBeCloseTo(80);
  });

  it("keeps a series that is already a percentage", () => {
    const out = toMassPercent({ name: "tg", x: [30, 100], y: [100, 40] });
    expect(out.y).toEqual([100, 40]);
  });

  it("derives percent per minute when a heating rate is given", () => {
    const out = derivativeMass({ name: "10", x: [0, 10, 20], y: [10, 9, 8] }, 10);
    expect(out.y[1]).toBeLessThan(0);
    expect(out.y[1]).toBeCloseTo(-10);
  });

  it("converts dV/dD to dV per log diameter", () => {
    const out = toDvDlog({ name: "pore", x: [10], y: [1] });
    expect(out.y[0]).toBeCloseTo(10 * Math.log(10));
  });

  it("keeps each curve's own x in the long csv", () => {
    const csv = overlayLongCsv([
      { name: "ads", x: [0.1, 0.9, 0.2], y: [1, 2, 1.5] },
    ]);
    expect(csv.split("\n")[3]).toBe("ads,0.2,1.5");
    expect(axisForOverlay("pore", "dv_dlog", false).xLog).toBe(true);
    expect(axisForOverlay("bet", "none", false).markers).toBe(true);
  });
});
