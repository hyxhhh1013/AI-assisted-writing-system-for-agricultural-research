import { describe, expect, it } from "vitest";
import {
  runProductGateCases,
  summarizeProductGateResults,
} from "@/lib/eval/product-gates";

describe("W3-E2E-EVAL product gates", () => {
  it("fixed product gate suite is green", () => {
    const results = runProductGateCases();
    const summary = summarizeProductGateResults(results);
    if (summary.failed > 0) {
      const msg = summary.failures
        .map((f) => `- ${f.id}: ${f.detail}`)
        .join("\n");
      expect.fail(`${summary.failed} gate(s) failed:\n${msg}`);
    }
    expect(summary.passed).toBeGreaterThan(10);
  });
});
