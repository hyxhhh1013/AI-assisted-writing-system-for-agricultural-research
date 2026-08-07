import { describe, expect, it } from "vitest";
import { groupSectionGuides } from "@/lib/blueprint-utils";
import { writingBlueprintPayloadSchema } from "@/lib/validations";
import type { SectionGuide } from "@/contracts/writing-blueprint";

const guides: SectionGuide[] = [
  { sectionPath: "引言", purpose: "建立背景", keyPoints: ["a"] },
  { sectionPath: "研究现状与问题", purpose: "梳理问题", keyPoints: ["a"] },
  {
    sectionPath: "研究进展综述 > 生物油定向提质",
    purpose: "综述生物油",
    keyPoints: ["a"],
  },
  {
    sectionPath: "研究进展综述 > 合成气定向调控",
    purpose: "综述合成气",
    keyPoints: ["a"],
  },
  { sectionPath: "结论与展望", purpose: "总结", keyPoints: ["a"] },
];

describe("groupSectionGuides", () => {
  it("把「研究进展综述 > 子节」按顶层章节收进一组，顶层章节自身平铺", () => {
    const groups = groupSectionGuides(guides);
    const research = groups.find((g) => g.top === "研究进展综述");
    expect(research?.nested.length).toBe(2);
    expect(research?.topLevel.length).toBe(0);
    const intro = groups.find((g) => g.top === "引言");
    expect(intro?.topLevel.length).toBe(1);
    expect(intro?.nested.length).toBe(0);
  });

  it("保持大纲顺序", () => {
    const groups = groupSectionGuides(guides);
    expect(groups.map((g) => g.top)).toEqual([
      "引言",
      "研究现状与问题",
      "研究进展综述",
      "结论与展望",
    ]);
  });

  it("空输入返回空数组", () => {
    expect(groupSectionGuides([])).toEqual([]);
  });

  it("同名顶层且自身也有子节指导时分开收纳", () => {
    const mixed: SectionGuide[] = [
      { sectionPath: "A", purpose: "p", keyPoints: ["x"] },
      { sectionPath: "A > B", purpose: "p", keyPoints: ["x"] },
    ];
    const groups = groupSectionGuides(mixed);
    expect(groups[0]?.topLevel.length).toBe(1);
    expect(groups[0]?.nested.length).toBe(1);
  });
});

describe("writingBlueprintPayloadSchema 可选字段", () => {
  it("接受 projectMode / language 可选字段", () => {
    const payload = {
      version: 1,
      narrativeSummary: "n",
      thesis: "t",
      estimatedWordCount: { min: 8000, max: 10000 },
      figurePlan: {
        totalMin: 2,
        totalMax: 3,
        items: [
          {
            id: "fig-1",
            sectionPath: "结果",
            type: "chart",
            purpose: "p",
            suggestedCaption: "c",
            priority: "required",
          },
        ],
      },
      sectionGuides: [
        { sectionPath: "引言", purpose: "p", keyPoints: ["k"] },
      ],
      writingOrder: ["引言"],
      prerequisites: ["x"],
      projectMode: "review",
      language: "zh",
    };
    const r = writingBlueprintPayloadSchema.safeParse(payload);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.projectMode).toBe("review");
      expect(r.data.language).toBe("zh");
    }
  });

  it("不填 projectMode/language 也通过（旧蓝图兼容）", () => {
    const payload = {
      version: 1,
      narrativeSummary: "n",
      thesis: "t",
      estimatedWordCount: { min: 8000, max: 10000 },
      figurePlan: {
        totalMin: 2,
        totalMax: 3,
        items: [
          {
            id: "fig-1",
            sectionPath: "引言",
            type: "schematic",
            purpose: "p",
            suggestedCaption: "c",
            priority: "optional",
          },
        ],
      },
      sectionGuides: [{ sectionPath: "引言", purpose: "p", keyPoints: ["k"] }],
      writingOrder: ["引言"],
      prerequisites: ["x"],
    };
    expect(writingBlueprintPayloadSchema.safeParse(payload).success).toBe(true);
  });
});
