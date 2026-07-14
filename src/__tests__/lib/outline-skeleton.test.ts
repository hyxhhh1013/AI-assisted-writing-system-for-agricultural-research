import { describe, expect, it } from "vitest";
import {
  getDefaultUserSkeleton,
  parseSkeletonLines,
} from "@/lib/outline-skeleton";
import { buildOutlinePrompt } from "@/lib/prompts/outline";
import { outlineSchema } from "@/lib/validations";

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
    expect(prompt).not.toMatch(/【大纲结构要求】—— 必须包含/);
  });

  it("provides mode-specific default skeletons", () => {
    expect(getDefaultUserSkeleton("review")).toContain("研究进展综述");
    expect(getDefaultUserSkeleton("research")).toContain("材料与方法");
    expect(parseSkeletonLines("摘要\n\n引言\n  \n结论")).toEqual(["摘要", "引言", "结论"]);
  });
});
