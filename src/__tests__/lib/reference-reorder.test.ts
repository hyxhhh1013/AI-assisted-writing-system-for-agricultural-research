import { describe, it, expect } from "vitest";
import {
  buildReorderedReferences,
  buildPreviewReferencesFromContent,
  collectCitationFirstAppearance,
  compactCitationsToUsedReferences,
  mergeSectionReferencesIntoProject,
  referencesFromRefMapping,
  remapBracketCitations,
} from "@/lib/reference-reorder";

describe("reference-reorder", () => {
  it("collects first appearance in reading order", () => {
    const text = "前文 [3] 后文 [1,2] 再 [3]";
    expect(collectCitationFirstAppearance(text, 5)).toEqual([3, 1, 2]);
  });

  it("reorders references and remaps citations without collision", () => {
    const refs = ["A", "B", "C"];
    const built = buildReorderedReferences([3, 1], refs);
    expect(built?.references).toEqual(["C", "A", "B"]);
    expect(built?.indexMap).toEqual({ 1: 2, 2: 3, 3: 1 });

    const remapped = remapBracketCitations("见 [3] 与 [1,2]", built!.indexMap);
    expect(remapped).toBe("见 [1] 与 [2, 3]");
  });

  it("includes review sections when scanning merged project text", () => {
    const text = [
      "摘要 [2]",
      "引言 [1]",
      "研究现状 [3]",
      "进展综述 [1,3]",
      "结论 [2]",
    ].join("\n\n");
    expect(collectCitationFirstAppearance(text, 3)).toEqual([2, 1, 3]);
  });

  it("buildPreviewReferencesFromContent prefers stream list over project pool", () => {
    const fromStream = buildPreviewReferencesFromContent(
      "正文 [2]",
      ["a.pdf", "b.pdf"],
      ["b.pdf", "a.pdf"],
    );
    expect(fromStream).toEqual(["b.pdf", "a.pdf"]);
  });

  it("buildPreviewReferencesFromContent uses refMapping pool when project refs are empty", () => {
    const cited = buildPreviewReferencesFromContent(
      "Introduction [2] and [1]",
      [],
      undefined,
      { "a.pdf": 1, "b.pdf": 2 },
    );
    expect(cited).toEqual(["b.pdf", "a.pdf"]);
  });

  it("referencesFromRefMapping rebuilds dense index pool", () => {
    expect(referencesFromRefMapping({ "x.pdf": 1, "y.pdf": 3 })).toEqual(["x.pdf", "", "y.pdf"]);
  });

  it("compactCitationsToUsedReferences remaps body to 1..K", () => {
    const pool = ["a.pdf", "b.pdf", "c.pdf", "d.pdf", "e.pdf"];
    const out = compactCitationsToUsedReferences("见[4]与\\[2\\]及[4]。", pool);
    expect(out?.references).toEqual(["d.pdf", "b.pdf"]);
    expect(out?.text).toContain("[1]");
    expect(out?.text).toContain("[2]");
    expect(out?.text).not.toMatch(/\[4\]/);
  });

  it("mergeSectionReferencesIntoProject appends and remaps globally", () => {
    const merged = mergeSectionReferencesIntoProject({
      sectionText: "据[1]与[2]报道。",
      sectionReferences: ["new.pdf", "old.pdf"],
      projectReferences: ["old.pdf"],
    });
    expect(merged.references).toEqual(["old.pdf", "new.pdf"]);
    // section [1]=new → project [2]; section [2]=old → project [1]
    expect(merged.text).toBe("据[2]与[1]报道。");
  });
});
