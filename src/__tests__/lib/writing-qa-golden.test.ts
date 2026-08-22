import { describe, expect, it } from "vitest";
import { assertWriteQaGoldens, WRITE_QA_GOLDENS } from "@/lib/quality-eval/write-qa-fixtures";

describe("WRITE-QA-008 golden fixtures", () => {
  it("covers introduction / methods / results / discussion / literature_body", () => {
    const keys = new Set(WRITE_QA_GOLDENS.map((g) => g.sectionKey));
    expect([...keys].sort()).toEqual([
      "discussion",
      "introduction",
      "literature_body",
      "methods",
      "results",
    ]);
    expect(WRITE_QA_GOLDENS.some((g) => g.id.endsWith("/pass"))).toBe(true);
    expect(WRITE_QA_GOLDENS.some((g) => g.id.endsWith("/fail"))).toBe(true);
  });

  it("locks expected verdicts and codes", () => {
    const gate = assertWriteQaGoldens();
    expect(gate.failures, gate.failures.join("\n")).toEqual([]);
    expect(gate.ok).toBe(true);
  });
});
