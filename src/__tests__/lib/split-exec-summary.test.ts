import { describe, expect, it } from "vitest";
import { parseChoicePrompt, expandChoiceDigitGoal } from "@/lib/agent/choice-prompt-display";
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

  it("does not treat subsection 3.2 as choice option 3", () => {
    const parsed = parseChoicePrompt(
      [
        "请确认下一步（二选一）：",
        "1. **继续补引用**——把现有 [13]–[29] 织入 3.2 合成气 / 3.3 碳纳米材料 / 3.4 失活再生；",
        "2. **改主意要外部新增**——给目标总篇数。",
        "回「1」或「2（+篇数）」。",
      ].join("\n"),
    );
    expect(parsed?.options).toHaveLength(2);
    expect(parsed?.options[0]).toContain("继续补引用");
    expect(parsed?.options[1]).toContain("外部新增");
  });

  it("parses 「1」= bullet choices", () => {
    const parsed = parseChoicePrompt(
      [
        "请回一个字即可：",
        "- **「1」** = 继续补引用：织入现有未引用文献；",
        "- **「2 + 目标篇数」** = 改主意要外部新增。",
      ].join("\n"),
    );
    expect(parsed?.options[0]).toContain("继续补引用");
    expect(parsed?.options[1]).toContain("外部新增");
  });
});

describe("expandChoiceDigitGoal", () => {
  it("expands 1 to 补引用 even when the last thought mentions 3.2", () => {
    const goal = expandChoiceDigitGoal("1", [
      {
        kind: "summary",
        summary: {
          text: [
            "请回一个字即可：",
            "- **「1」** = 继续补引用：织入 3.2 合成气 / 3.3 碳纳米材料；",
            "- **「2 + 目标篇数」** = 改主意要外部新增。",
            "你回「1」，我立刻开始写 3.2 节。",
          ].join("\n"),
          toolCallCount: 0,
          keyFindings: [],
        },
      },
    ]);
    expect(goal).toContain("继续补引用");
    expect(goal).not.toMatch(/^2 /);
  });
});
