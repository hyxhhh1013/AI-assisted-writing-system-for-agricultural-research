import { describe, expect, it } from "vitest";
import {
  liftWritingQualityFindings,
  parseWritingQaReport,
  summarizeWritingQa,
  verdictFromWritingFindings,
  shouldPersistWritingDraft,
  isWriteSectionSettled,
  writingQaVerdictLabel,
} from "@/contracts/writing-qa";

describe("WritingQaReport", () => {
  it("lifts WQC rules onto WRITE-QA codes", () => {
    const report = liftWritingQualityFindings(
      [
        {
          rule: "throat_clear",
          count: 2,
          message: "喉清开场 2 处",
          examples: ["众所周知"],
        },
        {
          rule: "connective_overuse",
          count: 3,
          message: "综上所述堆砌",
        },
        {
          rule: "para_variance",
          count: 4,
          message: "段落过齐",
        },
      ],
      { sectionKey: "introduction", charCount: 800 },
    );
    expect(report.verdict).toBe("repair");
    expect(report.findings.find((f) => f.code === "throat_clear")?.action).toBe("repair");
    expect(report.findings.find((f) => f.code === "hollow_phrase")?.layer).toBe("L2");
    expect(report.findings.find((f) => f.code === "para_monotone")?.action).toBe("warn");
    expect(report.sectionKey).toBe("introduction");
    expect(summarizeWritingQa(report).repairCodes).toEqual(["throat_clear", "hollow_phrase"]);
  });

  it("parses a structured report and summarizes block", () => {
    const parsed = parseWritingQaReport({
      verdict: "block",
      sectionKey: "results",
      findings: [
        {
          code: "number_not_in_claims",
          layer: "L0",
          action: "block",
          message: "数字不在 dataClaims",
        },
        {
          code: "overclaim",
          layer: "L2",
          action: "repair",
          message: "最优",
          examples: ["最优"],
        },
      ],
    });
    expect(parsed?.verdict).toBe("block");
    expect(verdictFromWritingFindings(parsed!.findings)).toBe("block");
    expect(summarizeWritingQa(parsed!).blockCodes).toEqual(["number_not_in_claims"]);
    expect(writingQaVerdictLabel("block")).toBe("不可写回");
    expect(writingQaVerdictLabel("pass")).toBe("可接受");
    expect(shouldPersistWritingDraft(parsed!)).toBe(false);
    expect(isWriteSectionSettled({ persisted: null, blocked: true })).toBe(true);
    expect(isWriteSectionSettled({ persisted: { sectionKey: "results" } })).toBe(true);
    expect(isWriteSectionSettled({ persisted: null })).toBe(false);
  });

  it("rejects malformed reports", () => {
    expect(parseWritingQaReport(null)).toBeNull();
    expect(parseWritingQaReport({ verdict: "pass" })).toBeNull();
  });
});
