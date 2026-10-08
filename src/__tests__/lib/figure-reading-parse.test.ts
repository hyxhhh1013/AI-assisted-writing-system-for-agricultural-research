import { describe, expect, it } from "vitest";
import {
  figureReadingsToEvidence,
  parseFigureReadingsJson,
} from "@/lib/agent/figure-reading-parse";

describe("figure reading parse", () => {
  it("parses fenced JSON and drops empty points", () => {
    const parsed = parseFigureReadingsJson(`说明如下\n\`\`\`json
{"note":"误差棒看不清","points":[{"series":"CK","y":"10.2","unit":"t/ha"},{"series":"","y":"1"}]}
\`\`\``);
    expect(parsed.note).toBe("误差棒看不清");
    expect(parsed.points).toEqual([{ series: "CK", y: "10.2", unit: "t/ha" }]);
  });

  it("turns a confirmed reading into a numeric claim", () => {
    const { claims } = figureReadingsToEvidence("结果图.png", "D-结果图", [
      { series: "CK", y: "10.2", unit: "t/ha" },
    ]);
    expect(claims[0]?.text).toContain("10.2");
    expect(claims[0]?.values.y).toBe(10.2);
    expect(claims[0]?.sourceId).toBe("D-结果图");
  });
});