import { describe, expect, it } from "vitest";
import { splitExecSummary } from "@/lib/agent/split-exec-summary";

describe("splitExecSummary", () => {
  it("keeps plain body when no marker", () => {
    expect(splitExecSummary("任务已完成。")).toEqual({
      body: "任务已完成。",
      execSummary: null,
    });
  });

  it("splits body and exec summary", () => {
    const text =
      "已导入 1 篇文献，建议下一步写大纲。\n\n执行摘要:\n[inspect_project] ok\n[import_reference] 已导入";
    expect(splitExecSummary(text)).toEqual({
      body: "已导入 1 篇文献，建议下一步写大纲。",
      execSummary: "[inspect_project] ok\n[import_reference] 已导入",
    });
  });

  it("handles summary-only text", () => {
    const text = "执行摘要:\n[search_external] 8 篇";
    expect(splitExecSummary(text)).toEqual({
      body: "",
      execSummary: "[search_external] 8 篇",
    });
  });

  it("tolerates null/undefined", () => {
    expect(splitExecSummary(undefined)).toEqual({ body: "", execSummary: null });
    expect(splitExecSummary(null)).toEqual({ body: "", execSummary: null });
  });
});
