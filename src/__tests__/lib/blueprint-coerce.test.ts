import { describe, expect, it } from "vitest";
import {
  coerceWritingBlueprintPayload,
  formatBlueprintValidationError,
} from "@/lib/blueprint-coerce";
import { buildBlueprintPrompt } from "@/lib/prompts/blueprint";
import { writingBlueprintPayloadSchema } from "@/lib/validations";

function expectValid(raw: unknown) {
  const coerced = coerceWritingBlueprintPayload(raw);
  const r = writingBlueprintPayloadSchema.safeParse(coerced);
  if (!r.success) {
    throw new Error(formatBlueprintValidationError(r.error.issues));
  }
  return r.data;
}

describe("coerceWritingBlueprintPayload — 真实模型偏差", () => {
  it("maps Chinese/English language + string version/numbers", () => {
    const data = expectValid({
      version: "1",
      language: "Chinese",
      narrativeSummary: "叙事",
      thesis: "论点",
      estimatedWordCount: { min: "8000", max: "10000" },
      figurePlan: {
        totalMin: "2",
        totalMax: "3",
        items: [
          {
            sectionPath: "引言",
            type: "schematic",
            purpose: "框架",
            suggestedCaption: "图1",
            priority: "required",
          },
        ],
      },
      sectionGuides: [
        { sectionPath: "引言", purpose: "背景", keyPoints: ["缺口"] },
      ],
    });
    expect(data.language).toBe("zh");
    expect(data.version).toBe(1);
    expect(data.figurePlan.items[0]?.id).toBe("fig-1");
  });

  it("drops invalid dataSource / projectMode instead of failing zod", () => {
    const data = expectValid({
      version: 1,
      projectMode: "综述",
      language: "中文",
      narrativeSummary: "n",
      thesis: "t",
      estimatedWordCount: { min: 1, max: 2 },
      figurePlan: {
        totalMin: 1,
        totalMax: 1,
        items: [
          {
            id: "f1",
            sectionPath: "引言",
            type: "流程图",
            purpose: "p",
            suggestedCaption: "c",
            priority: "可选",
            dataSource: "实验室数据",
          },
        ],
      },
      sectionGuides: [{ sectionPath: "引言", purpose: "p", keyPoints: "单句要点" }],
      writingOrder: "引言",
      prerequisites: null,
    });
    expect(data.projectMode).toBe("review");
    expect(data.language).toBe("zh");
    expect(data.figurePlan.items[0]?.type).toBe("flow");
    expect(data.figurePlan.items[0]?.dataSource).toBe("experiment");
    expect(data.sectionGuides[0]?.keyPoints).toEqual(["单句要点"]);
    expect(data.writingOrder).toEqual(["引言"]);
    expect(data.prerequisites).toEqual([]);
  });

  it("coerces estimatedWordCount from range string or bare number", () => {
    const a = expectValid({
      narrativeSummary: "n",
      thesis: "t",
      estimatedWordCount: "6000-12000",
      figurePlan: {
        items: [
          {
            sectionPath: "结论",
            type: "other",
            purpose: "p",
            suggestedCaption: "c",
            priority: "required",
          },
        ],
      },
      sectionGuides: [{ sectionPath: "结论", purpose: "p", keyPoints: ["a"] }],
    });
    expect(a.estimatedWordCount).toEqual({ min: 6000, max: 12000 });
    expect(a.version).toBe(1);

    const b = expectValid({
      narrativeSummary: "n",
      thesis: "t",
      estimatedWordCount: 9000,
      figurePlan: { items: a.figurePlan.items },
      sectionGuides: a.sectionGuides,
    });
    expect(b.estimatedWordCount).toEqual({ min: 9000, max: 9000 });
  });

  it("synthesizes minimal figure/guides when arrays empty after cleaning", () => {
    const data = expectValid({
      narrativeSummary: "n",
      thesis: "t",
      figurePlan: { items: [{ purpose: "残缺项无路径" }] },
      sectionGuides: [{ sectionPath: "", purpose: "", keyPoints: [] }],
      writingOrder: ["引言", "结论"],
    });
    expect(data.figurePlan.items.length).toBeGreaterThanOrEqual(1);
    expect(data.sectionGuides.length).toBeGreaterThanOrEqual(1);
  });

  it("fills missing narrative/thesis rather than failing", () => {
    const data = expectValid({
      figurePlan: {
        items: [
          {
            sectionPath: "引言",
            type: "other",
            purpose: "p",
            suggestedCaption: "c",
            priority: "required",
          },
        ],
      },
      sectionGuides: [{ sectionPath: "引言", purpose: "p", keyPoints: ["a"] }],
    });
    expect(data.narrativeSummary.length).toBeGreaterThan(0);
    expect(data.thesis.length).toBeGreaterThan(0);
  });
});

describe("buildBlueprintPrompt — 不再诱导非法枚举", () => {
  it("uses zh/en in JSON example, not Chinese/English", () => {
    const p = buildBlueprintPrompt({
      title: "t",
      researchDirection: "d",
      outline: "## 引言\n要点",
      language: "zh",
      projectMode: "review",
    });
    expect(p).toContain('"language": "zh"');
    expect(p).not.toContain('"language": "Chinese"');
    expect(p).not.toContain('"language": "English"');
    expect(p).toContain('"projectMode": "review"');
    expect(p).toContain('"dataSource": "literature"');
    expect(p).not.toMatch(/"dataSource": "experiment"/);
  });

  it("research example keeps experiment + research mode", () => {
    const p = buildBlueprintPrompt({
      title: "t",
      researchDirection: "d",
      outline: "## 材料与方法\n设计",
      language: "en",
      projectMode: "research",
    });
    expect(p).toContain('"language": "en"');
    expect(p).toContain('"projectMode": "research"');
    expect(p).toContain('"dataSource": "experiment"');
  });
});

describe("formatBlueprintValidationError", () => {
  it("includes field path", () => {
    const r = writingBlueprintPayloadSchema.safeParse({ version: 2 });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = formatBlueprintValidationError(r.error.issues);
      expect(msg).toContain("写作蓝图结构无效");
    }
  });
});
