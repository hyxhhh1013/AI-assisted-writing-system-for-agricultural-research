import { describe, expect, it } from "vitest";
import {
  enforceOutlineAgainstSkeleton,
  getDefaultUserSkeleton,
  parseSkeletonLines,
  scrubForbiddenReviewHeadings,
  skeletonConflictsWithMode,
} from "@/lib/outline-skeleton";
import { buildOutlinePrompt } from "@/lib/prompts/outline";
import { outlineSchema } from "@/lib/validations";
import { stripInlineCitations } from "@/lib/abstract-utils";

describe("outline userSkeleton (ENG-PR-083)", () => {
  it("rejects outline requests without userSkeleton", () => {
    const result = outlineSchema.safeParse({ title: "测试综述" });
    expect(result.success).toBe(false);
  });

  it("accepts outline requests with at least 3 skeleton lines", () => {
    const result = outlineSchema.safeParse({
      title: "测试综述",
      userSkeleton: ["摘要", "引言", "结论"],
    });
    expect(result.success).toBe(true);
  });

  it("injects skeleton constraint into review prompt", () => {
    const prompt = buildOutlinePrompt({
      title: "茶园土壤改良综述",
      researchDirection: "土壤改良剂",
      language: "zh",
      contextText: "ref",
      projectMode: "review",
      userSkeleton: ["摘要", "引言", "研究进展综述"],
    });
    expect(prompt).toMatch(/用户给定的一级章节骨架/);
    expect(prompt).toMatch(/研究进展综述/);
    expect(prompt).toMatch(/逐字/);
    expect(prompt).not.toMatch(/【大纲结构要求】—— 必须包含/);
  });

  it("marks attachment-locked skeleton and injects framework block", () => {
    const prompt = buildOutlinePrompt({
      title: "茶园土壤改良综述",
      researchDirection: "土壤改良剂",
      language: "zh",
      contextText: "ref",
      projectMode: "review",
      userSkeleton: ["摘要", "机理进展", "展望"],
      skeletonFromAttachment: true,
      frameworkBlock: "【用户上传的大纲/框架附件：部分大纲.md】",
    });
    expect(prompt).toMatch(/用户附件锁定的一级章节骨架/);
    expect(prompt).toMatch(/部分大纲\.md/);
    expect(prompt).toMatch(/服从附件/);
  });

  it("provides mode-specific default skeletons", () => {
    expect(getDefaultUserSkeleton("review")).toContain("研究进展综述");
    expect(getDefaultUserSkeleton("research")).toContain("材料与方法");
    expect(parseSkeletonLines("摘要\n\n引言\n  \n结论")).toEqual(["摘要", "引言", "结论"]);
  });

  it("detects skeleton/mode conflicts", () => {
    expect(skeletonConflictsWithMode(["摘要", "材料与方法", "结论"], "review")).toBe(true);
    expect(skeletonConflictsWithMode(getDefaultUserSkeleton("review"), "review")).toBe(false);
  });

  it("rewrites level-1 headings to match skeleton", () => {
    const raw = `## 摘要 — x\n## 引言\n### 子节\n## 材料与方法\n## 结果与分析\n## 结论`;
    const skeleton = ["摘要", "引言", "研究现状与问题", "研究进展综述", "结论与展望"];
    const fixed = enforceOutlineAgainstSkeleton(raw, skeleton);
    expect(fixed).toContain("## 研究现状与问题");
    expect(fixed).toContain("## 研究进展综述");
    expect(fixed).not.toMatch(/^## 材料与方法/m);
    expect(fixed).toContain("### 子节");
  });

  it("scrubs forbidden review headings as fallback", () => {
    const raw = "## 材料与方法\n### a";
    const scrubbed = scrubForbiddenReviewHeadings(raw);
    expect(scrubbed).toMatch(/^## 摘要/m);
  });
});

describe("abstract utils", () => {
  it("strips inline citation markers", () => {
    expect(stripInlineCitations("研究表明效果显著[1,2]。另见[3-5]。")).toBe(
      "研究表明效果显著。另见。",
    );
  });
});
