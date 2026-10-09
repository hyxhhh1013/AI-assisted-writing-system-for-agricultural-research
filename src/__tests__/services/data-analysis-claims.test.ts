import { describe, expect, it } from "vitest";
import { analyzeFile } from "@/services/data-analysis";

describe("analyzeFile claims", () => {
  it("样品名里的逗号并回第一列，三行带隙都留下", async () => {
    const csv = [
      "样品,光学带隙 (eV)",
      "BAO:0.24Cr3+,3.54",
      "BAO:0.24Cr3+,0.12Bi3+,3.44",
      "BAO:0.24Cr3+,0.25Bi3+,3.40",
    ].join("\n");
    const result = await analyzeFile(csv, "bandgap.csv");
    expect(result.analysis.rowCount).toBe(3);
    const dumped = JSON.stringify(result);
    expect(dumped).toContain("3.54");
    expect(dumped).toContain("3.44");
    expect(dumped).toContain("3.4");
  });

  it("元素组成表不生成组间提高百分之几", async () => {
    const csv = [
      "元素,原子百分比 (%)",
      "Al,40.78",
      "O,54.70",
      "Ba,3.57",
      "Cr,0.93",
      "Bi,0.01",
    ].join("\n");
    const { claims } = await analyzeFile(csv, "eds.csv");
    const text = claims.map((c) => c.text).join("\n");
    expect(text).not.toMatch(/较/);
    expect(text).toContain("Al 40.78");
    expect(text).toContain("O 54.7");
    expect(claims.some((c) => c.values.Al === 40.78)).toBe(true);
  });
});
