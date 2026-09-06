import { describe, expect, it } from "vitest";
import {
  detectSectionHeading,
  preferChunksByPaperSection,
  preferredPaperSectionsForWriting,
  segmentLinesBySection,
} from "@/lib/paper-section";
import {
  detectSectionHeading as detectMjs,
  segmentLinesBySection as segmentMjs,
} from "../../../scripts/lib/paper-section.mjs";
import type { RagChunk } from "@/lib/rag";

function chunk(id: string, section?: string): RagChunk {
  return {
    content: id,
    metadata: { source: `${id}.pdf`, category: "测试", id, ...(section ? { section } : {}) },
  };
}

describe("detectSectionHeading", () => {
  it("recognizes IMRaD headings with numbering", () => {
    expect(detectSectionHeading("1. Introduction")).toBe("introduction");
    expect(detectSectionHeading("二、材料与方法")).toBe("methods");
    expect(detectSectionHeading("Results")).toBe("results");
    expect(detectSectionHeading("摘要")).toBe("abstract");
    expect(detectSectionHeading("3. Discussion")).toBe("discussion");
    expect(detectSectionHeading("Conclusions")).toBe("conclusion");
  });

  it("does not treat body sentences as headings", () => {
    expect(detectSectionHeading("Results showed that yield increased significantly.")).toBeNull();
    expect(detectSectionHeading("In the Introduction we argued that biochar matters")).toBeNull();
    expect(detectSectionHeading("材料与方法详见下文所述的制备流程。")).toBeNull();
  });

  it("stays aligned with scripts/lib/paper-section.mjs", () => {
    const samples = ["1. Introduction", "Materials and Methods", "Results showed that x", "结论"];
    for (const s of samples) {
      expect(detectSectionHeading(s)).toBe(detectMjs(s));
    }
  });
});

describe("segmentLinesBySection", () => {
  it("carries section state from introduction into methods", () => {
    const segs = segmentLinesBySection([
      "1. Introduction",
      "Biochar has been widely studied in soils.",
      "2. Materials and Methods",
      "Soil samples were collected from three sites.",
    ]);
    expect(segs).toHaveLength(2);
    expect(segs[0].section).toBe("introduction");
    expect(segs[0].text).toContain("Biochar");
    expect(segs[1].section).toBe("methods");
    expect(segs[1].text).toContain("Soil samples");
    expect(segmentMjs(["Introduction", "body"], null)[0].section).toBe("introduction");
  });
});

describe("preferChunksByPaperSection", () => {
  it("maps writing sections to paper sections", () => {
    expect(preferredPaperSectionsForWriting("methods")).toEqual(["methods"]);
    expect(preferredPaperSectionsForWriting("results")).toContain("results");
  });

  it("keeps untagged old chunks when few tagged hits exist", () => {
    const mixed = [chunk("old-a"), chunk("old-b"), chunk("m1", "methods")];
    expect(preferChunksByPaperSection(mixed, "methods").map((c) => c.metadata.id)).toEqual([
      "old-a",
      "old-b",
      "m1",
    ]);
  });

  it("promotes tagged methods/results once enough preferred hits exist", () => {
    const mixed = [
      chunk("old"),
      chunk("intro", "introduction"),
      chunk("m1", "methods"),
      chunk("m2", "methods"),
    ];
    expect(preferChunksByPaperSection(mixed, "methods").map((c) => c.metadata.id)).toEqual([
      "m1",
      "m2",
      "old",
      "intro",
    ]);
  });
});
