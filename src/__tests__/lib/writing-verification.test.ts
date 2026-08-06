import { describe, expect, it } from "vitest";
import {
  formatVerificationIssuesForRefiner,
  hasActionableVerificationIssues,
  parseVerificationReport,
} from "@/contracts/writing-verification";

describe("parseVerificationReport", () => {
  it("parses structured JSON", () => {
    const raw = JSON.stringify({
      passed: false,
      summary: "发现 overclaim",
      issues: [
        {
          id: "v1",
          type: "overclaim",
          severity: "high",
          originalText: "首次证明",
          suggestion: "改为「表明」",
        },
      ],
    });
    const report = parseVerificationReport(raw);
    expect(report.passed).toBe(false);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].type).toBe("overclaim");
    expect(hasActionableVerificationIssues(report)).toBe(true);
  });

  it("accepts PASS plain text fallback", () => {
    const report = parseVerificationReport("PASS：逐条核实通过");
    expect(report.passed).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("degrades on invalid JSON without throwing", () => {
    const report = parseVerificationReport("这不是 JSON，但是有问题：引用可疑");
    expect(report.passed).toBe(false);
    expect(report.rawText).toContain("不是 JSON");
  });

  it("formats selected issues for refiner", () => {
    const report = parseVerificationReport(
      JSON.stringify({
        passed: false,
        summary: "两处问题",
        issues: [
          {
            id: "v1",
            type: "overclaim",
            severity: "high",
            originalText: "A",
            suggestion: "a",
          },
          {
            id: "v2",
            type: "vague_expression",
            severity: "low",
            originalText: "B",
            suggestion: "b",
          },
        ],
      }),
    );
    const allHighMed = formatVerificationIssuesForRefiner(report);
    expect(allHighMed).toContain("v1");
    expect(allHighMed).not.toContain("id=v2");
    const onlyV2 = formatVerificationIssuesForRefiner(report, ["v2"]);
    expect(onlyV2).toContain("v2");
  });
});
