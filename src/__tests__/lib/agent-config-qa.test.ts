import { describe, expect, it } from "vitest";
import {
  CONFIG_QA_STEPS,
  defaultConfigQaAnswers,
  isConfigQaComplete,
  toPaperConfigRecord,
} from "@/lib/agent/config-qa";

describe("config Q&A", () => {
  it("has six guided steps", () => {
    expect(CONFIG_QA_STEPS).toHaveLength(6);
    expect(CONFIG_QA_STEPS[0]?.id).toBe("paperTitle");
    expect(CONFIG_QA_STEPS.at(-1)?.id).toBe("targetJournal");
    expect(CONFIG_QA_STEPS.at(-1)?.optional).toBe(true);
  });

  it("completes when required fields filled", () => {
    const partial = defaultConfigQaAnswers(null, "预填题");
    expect(isConfigQaComplete(partial)).toBe(true);
    const rec = toPaperConfigRecord(partial);
    expect(rec?.paperTitle).toBe("预填题");
    expect(rec?.paperType).toBe("research");
  });

  it("rejects empty title", () => {
    expect(
      isConfigQaComplete({
        paperTitle: "  ",
        paperType: "review",
        language: "zh",
        citationStyle: "gbt7714",
        wordCount: "8000-12000",
        targetJournal: "",
      }),
    ).toBe(false);
  });
});
