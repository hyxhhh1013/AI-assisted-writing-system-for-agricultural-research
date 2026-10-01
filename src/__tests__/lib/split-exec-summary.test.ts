import { describe, expect, it } from "vitest";
import { parseChoicePrompt } from "@/lib/agent/choice-prompt-display";
import {
  compactSummaryBodyForDisplay,
  isolateClarifyQuestion,
  splitExecSummary,
} from "@/lib/agent/split-exec-summary";

describe("splitExecSummary", () => {
  it("splits on fullwidth colon after 执行摘要", () => {
    const raw = "请先选 1/2/3。\n\n执行摘要：\n[write_section] ok";
    const { body, execSummary } = splitExecSummary(raw);
    expect(body).toBe("请先选 1/2/3。");
    expect(execSummary).toContain("[write_section]");
  });

  it("compactSummaryBodyForDisplay keeps only the choice block", () => {
    const body = [
      "前面还有很长一段分析。",
      "下一步请选：",
      "1. 继续写",
      "2. 先写结论",
      "回复 1/2/3 即可。",
    ].join("\n");
    const compact = compactSummaryBodyForDisplay(body);
    expect(compact).toContain("下一步请选");
    expect(compact).not.toContain("前面还有很长一段");
  });

  it("isolateClarifyQuestion drops glued tool log so the answer box can stay on screen", () => {
    const question = [
      "**下一步请选**： 1. **继续写子节**； 2.**先写结论**； 3.**先补文献**再写。 回复 1 / 2 / 3 即可。",
      "执行摘要: [read_project_asset] 已读 passport [write_section] 已写回 introduction",
    ].join(" ");
    const isolated = isolateClarifyQuestion(question);
    expect(isolated).toContain("下一步请选");
    expect(isolated).not.toContain("read_project_asset");
    expect(isolated).not.toContain("introduction");
  });
});

describe("parseChoicePrompt", () => {
  it("parses options glued to 执行摘要 without a space after 2.", () => {
    const parsed = parseChoicePrompt(
      "**下一步请选**： 1. **继续写子节** (推荐)； 2.**先写结论**； 3.**先补文献**再写。 回复 1 / 2 / 3 即可。 执行摘要: [read_project_asset] 已读 passport",
    );
    expect(parsed?.options).toHaveLength(3);
    expect(parsed?.options[0]).toContain("继续写子节");
    expect(parsed?.options[1]).toContain("先写结论");
    expect(parsed?.options.some((o) => o.includes("read_project_asset"))).toBe(false);
  });
});
