import { describe, expect, it } from "vitest";
import {
  getRenderableSections,
  getTemplateSections,
} from "@/lib/template-sections";
import { buildStructureSectionsForWorkbench } from "@/lib/section-registry";

describe("research template sections", () => {
  it("sci research template lists five body sections with separate discussion", () => {
    const defs = getTemplateSections("sci", "research");
    expect(defs.map((d) => d.key)).toEqual([
      "introduction",
      "methods",
      "results",
      "discussion",
      "conclusion",
    ]);
  });

  it("getRenderableSections keeps discussion when it has content", () => {
    const rendered = getRenderableSections("sci", "research", {
      introduction: "intro",
      methods: "m",
      results: "r",
      discussion: "d",
      conclusion: "c",
    });
    expect(rendered.map((d) => d.key)).toEqual([
      "introduction",
      "methods",
      "results",
      "discussion",
      "conclusion",
    ]);
    expect(rendered.map((d) => d.sectionNumber)).toEqual([1, 2, 3, 4, 5]);
  });

  it("getRenderableSections hides empty discussion without renumbering gaps wrong", () => {
    const rendered = getRenderableSections("sci", "research", {
      introduction: "intro",
      methods: "m",
      results: "r",
      discussion: "",
      conclusion: "c",
    });
    expect(rendered.map((d) => d.key)).toEqual([
      "introduction",
      "methods",
      "results",
      "conclusion",
    ]);
    expect(rendered.at(-1)?.sectionNumber).toBe(4);
  });

  it("workbench structure sidebar includes discussion for research", () => {
    const sections = buildStructureSectionsForWorkbench({
      mode: "research",
      template: "sci",
    });
    expect(sections.map((s) => s.id)).toEqual([
      "abstract",
      "introduction",
      "methods",
      "results",
      "discussion",
      "conclusion",
    ]);
    expect(sections.find((s) => s.id === "results")?.label).not.toMatch(/Discussion|讨论/);
    expect(sections.find((s) => s.id === "discussion")?.label).toMatch(/Discussion|讨论/);
  });
});
