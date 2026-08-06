import { describe, it, expect } from "vitest";
import { blueprintSchema, writingBlueprintPayloadSchema } from "@/lib/validations";

describe("blueprintSchema", () => {
  it("requires title and outline", () => {
    expect(blueprintSchema.safeParse({ title: "t", outline: "x".repeat(20) }).success).toBe(true);
    expect(blueprintSchema.safeParse({ title: "t" }).success).toBe(false);
    expect(blueprintSchema.safeParse({ outline: "x".repeat(20) }).success).toBe(false);
  });
});

describe("writingBlueprintPayloadSchema", () => {
  it("accepts minimal valid blueprint", () => {
    const r = writingBlueprintPayloadSchema.safeParse({
      version: 1,
      narrativeSummary: "n",
      thesis: "t",
      estimatedWordCount: { min: 1000, max: 2000 },
      figurePlan: {
        totalMin: 1,
        totalMax: 2,
        items: [
          {
            id: "fig-1",
            sectionPath: "方法",
            type: "flow",
            purpose: "p",
            suggestedCaption: "c",
            priority: "required",
          },
        ],
      },
      sectionGuides: [
        { sectionPath: "方法", purpose: "p", keyPoints: ["a"] },
      ],
      writingOrder: ["方法"],
      prerequisites: [],
    });
    expect(r.success).toBe(true);
  });
});
