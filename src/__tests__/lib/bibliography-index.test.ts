import { describe, expect, it } from "vitest";
import { buildOutlinePrompt } from "@/lib/prompts/outline";
import {
  cleanBibliographyTitle,
  formatProjectBibliographyBlock,
} from "@/lib/agent/bibliography-index";

describe("bibliography-index", () => {
  it("strips Elsevier page chrome from titles", () => {
    const dirty =
      "[J] 黄升雄 (2022) Science of the Total Environment 802 Contents lists available at ScienceDirect journal homepage foo";
    expect(cleanBibliographyTitle(dirty)).toContain("黄升雄");
    expect(cleanBibliographyTitle(dirty)).not.toMatch(/Contents lists/i);
  });

  it("formats numbered catalog from evidence", () => {
    const block = formatProjectBibliographyBlock({
      references: ["filler one is long enough", "second line also long enough"],
      evidence: [
        {
          index: 1,
          title: "Co-pyrolysis of herb residue and polypropylene",
          abstract: "Catalytic upgrading of pyrolysis oil over Ni-ZSM-5.",
        },
        {
          index: 6,
          title: "Pyrolysis temperature influences rice straw and husk biochar",
          abstract: "Sorption of biourea composites depends on temperature.",
        },
      ],
      withAbstract: true,
    });
    expect(block).toContain("【项目参考文献】");
    expect(block).toContain("[1] Co-pyrolysis");
    expect(block).toContain("[6] Pyrolysis temperature");
    expect(block).toContain("禁止点名表外");
  });
});

describe("buildOutlinePrompt bibliography rule", () => {
  it("forbids naming papers outside the project list", () => {
    const prompt = buildOutlinePrompt({
      title: "热解温度与预处理",
      researchDirection: "热化学",
      language: "zh",
      contextText: "【项目参考文献】\n[6] Singh rice straw",
      projectMode: "review",
    });
    expect(prompt).toContain("禁止点名表中未出现的作者");
  });
});
