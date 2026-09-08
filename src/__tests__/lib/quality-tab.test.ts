import { describe, expect, it } from "vitest";
import { isHistoryTab, parseQualityTab, shouldOpenCheckResult } from "@/components/shared/quality/types";

describe("quality tab parsing", () => {
  it("defaults to overview and keeps rewrite/review", () => {
    expect(parseQualityTab(null)).toBe("overview");
    expect(parseQualityTab("history")).toBe("overview");
    expect(parseQualityTab("rewrite")).toBe("rewrite");
    expect(parseQualityTab("review")).toBe("review");
    expect(parseQualityTab("check")).toBe("check");
    expect(parseQualityTab("result")).toBe("check");
  });

  it("opens check result only for check/result URLs", () => {
    expect(shouldOpenCheckResult("result")).toBe(true);
    expect(shouldOpenCheckResult("check")).toBe(true);
    expect(shouldOpenCheckResult("overview")).toBe(false);
    expect(isHistoryTab("history")).toBe(true);
  });
});
