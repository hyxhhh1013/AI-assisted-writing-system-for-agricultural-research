import { describe, expect, it } from "vitest";
import type { WritingBlueprint } from "@/contracts/writing-blueprint";
import {
  blueprintPreviewFromToolData,
  formatBlueprintPreview,
  pickBlueprint,
} from "@/lib/agent/blueprint-review";

const sample: WritingBlueprint = {
  version: 1,
  narrativeSummary: "从背景到进展再到展望。",
  thesis: "生物炭可提升盐碱地作物产量。",
  estimatedWordCount: { min: 8000, max: 10000 },
  figurePlan: {
    totalMin: 2,
    totalMax: 4,
    items: [
      {
        id: "fig-1",
        sectionPath: "研究进展综述",
        type: "table",
        purpose: "催化剂对比",
        suggestedCaption: "表1 催化剂对比",
        priority: "required",
      },
    ],
  },
  sectionGuides: [
    {
      sectionPath: "引言",
      purpose: "提出科学问题",
      claim: "盐碱地需要土壤改良路径。",
      keyPoints: ["盐碱地现状", "生物炭机遇"],
    },
  ],
  writingOrder: ["引言", "结论"],
  prerequisites: [],
  generatedAt: 1,
};

describe("formatBlueprintPreview", () => {
  it("renders thesis, sections, and figure plan", () => {
    const text = formatBlueprintPreview(sample);
    expect(text).toContain("生物炭可提升盐碱地作物产量");
    expect(text).toContain("引言");
    expect(text).toContain("催化剂对比");
    expect(text).toContain("8000–10000");
  });
});

describe("blueprintPreviewFromToolData", () => {
  it("prefers formatted preview over summary", () => {
    expect(
      blueprintPreviewFromToolData(
        { preview: formatBlueprintPreview(sample), thesis: "短" },
        "已写回写作蓝图",
      ),
    ).toContain("各节要点");
  });

  it("falls back to summary when data has no preview", () => {
    expect(blueprintPreviewFromToolData({ persisted: true }, "已写回写作蓝图")).toBe(
      "已写回写作蓝图",
    );
  });
});

describe("pickBlueprint", () => {
  it("prefers project JSON for structured review", () => {
    const { blueprint, text } = pickBlueprint("短摘要", JSON.stringify(sample));
    expect(blueprint?.thesis).toContain("生物炭");
    expect(text).toContain("各节要点");
  });
});
