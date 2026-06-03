import { describe, it, expect } from "vitest";
import { buildOutlinePrompt } from "@/lib/prompts/outline";
import { resolveSectionPrompt } from "@/lib/prompts/writing";
import {
  getSectionKeysForMode,
  isSectionValidForMode,
  buildWorkbenchSectionsForMode,
} from "@/lib/section-registry";
import { buildConsistencyPrompt } from "@/lib/prompts/consistency";
import { mapToSectionForMode, buildOutlineTasks } from "@/lib/utils";
import { writingSchema, outlineSchema } from "@/lib/validations";
import {
  buildReviewVerifierChecklist,
  buildReviewSynthesisWriterBlock,
} from "@/lib/prompts/review-synthesis-rules";
import { buildVerifierSystemPrompt } from "@/lib/prompts/writing";
import { buildIntegrityReviewPrompt } from "@/lib/prompts/review-integrity";
import { resolveOutlineResearchDirection } from "@/services/outline";

describe("review dual-track", () => {
  it("review mode sections exclude methods/results", () => {
    const keys = getSectionKeysForMode("review");
    expect(keys).toContain("literature_body");
    expect(keys).toContain("background");
    expect(keys).not.toContain("methods");
    expect(keys).not.toContain("results");
  });

  it("research mode keeps IMRAD sections", () => {
    const keys = getSectionKeysForMode("research");
    expect(keys).toContain("methods");
    expect(keys).toContain("results");
    expect(keys).not.toContain("literature_body");
  });

  it("validates section against projectMode", () => {
    expect(isSectionValidForMode("literature_body", "review")).toBe(true);
    expect(isSectionValidForMode("methods", "review")).toBe(false);
    expect(isSectionValidForMode("methods", "research")).toBe(true);
    expect(isSectionValidForMode("literature_body", "research")).toBe(false);
  });

  it("writingSchema rejects methods in review mode", () => {
    const bad = writingSchema.safeParse({
      title: "t",
      section: "methods",
      projectMode: "review",
    });
    expect(bad.success).toBe(false);
  });

  it("review outline prompt forbids IMRaD experiment chapters", () => {
    const prompt = buildOutlinePrompt({
      title: "茶园土壤改良综述",
      researchDirection: "土壤改良剂 茶树",
      language: "zh",
      contextText: "ref",
      projectMode: "review",
    });
    expect(prompt).toMatch(/文献综述/);
    expect(prompt).toMatch(/禁止.*材料与方法|禁止出现「材料与方法」/);
    expect(prompt).not.toMatch(/试验材料与设计/);
  });

  it("research outline prompt includes methods/results", () => {
    const prompt = buildOutlinePrompt({
      title: "碳基肥试验",
      researchDirection: "水稻",
      language: "zh",
      contextText: "ref",
      projectMode: "research",
    });
    expect(prompt).toMatch(/材料与方法/);
    expect(prompt).toMatch(/结果与分析/);
  });

  it("review literature_body prompt forbids experiment voice", () => {
    const prompt = resolveSectionPrompt("literature_body", "review", {
      isGBT: true,
      isChinese: true,
    });
    expect(prompt).toMatch(/主题|综合/);
    expect(prompt).toMatch(/严禁|禁止/);
    expect(prompt).toMatch(/本试验|材料与方法/);
  });

  it("maps review outline headings to review section keys", () => {
    expect(mapToSectionForMode("研究进展综述 > 机理研究", "review")).toBe(
      "literature_body",
    );
    expect(mapToSectionForMode("研究现状与问题", "review")).toBe("background");
    expect(mapToSectionForMode("材料与方法", "review")).toBe("introduction");
  });

  it("workbench sections for review have 5 entries including abstract", () => {
    const sections = buildWorkbenchSectionsForMode("review");
    expect(sections.map((s) => s.id)).toEqual([
      "abstract",
      "introduction",
      "background",
      "literature_body",
      "conclusion",
    ]);
  });

  it("outlineSchema accepts projectMode", () => {
    const r = outlineSchema.safeParse({
      title: "x",
      projectMode: "review",
    });
    expect(r.success).toBe(true);
  });

  it("review synthesis writer block forbids verbatim copy", () => {
    const block = buildReviewSynthesisWriterBlock(true);
    expect(block).toMatch(/≥15 个汉字/);
    expect(block).toMatch(/本试验/);
  });

  it("review verifier checklist targets paraphrase and attribution", () => {
    expect(buildReviewVerifierChecklist()).toMatch(/照搬/);
    expect(buildReviewVerifierChecklist()).toMatch(/数据归属/);
    const sys = buildVerifierSystemPrompt("full", "review");
    expect(sys).toMatch(/综述/);
  });

  it("research verifier keeps IMRaD-specific checks", () => {
    const sys = buildVerifierSystemPrompt("full", "research");
    expect(sys).toMatch(/Results/);
  });

  it("integrity review prompt branches by projectMode", () => {
    const review = buildIntegrityReviewPrompt("段落", [], undefined, "review");
    expect(review.system).toMatch(/verbatim_copy|照搬/);
    const research = buildIntegrityReviewPrompt("段落", [], undefined, "research");
    expect(research.system).toMatch(/可复现|reproducibility/i);
  });

  it("resolveOutlineResearchDirection falls back to title", () => {
    expect(resolveOutlineResearchDirection("生物炭综述", "")).toBe("生物炭综述");
    expect(resolveOutlineResearchDirection("  题目  ", "  关键词  ")).toBe("关键词");
  });

  it("consistency prompt branches for review vs research", () => {
    const sections = [{ key: "literature_body", content: "进展…" }];
    const review = buildConsistencyPrompt({
      title: "综述",
      sections,
      outline: "",
      projectMode: "review",
    });
    expect(review).toMatch(/文献综述/);
    expect(review).toMatch(/literature_body/);
    expect(review).not.toMatch(/Results 中报的均值/);

    const research = buildConsistencyPrompt({
      title: "实验论文",
      sections: [{ key: "results", content: "结果…" }],
      outline: "",
      projectMode: "research",
    });
    expect(research).toMatch(/Results 中报的均值/);
  });
});
