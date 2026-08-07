import { describe, expect, it } from "vitest";
import { formatExternalLiteratureHit } from "@/lib/external-literature-format";

describe("formatExternalLiteratureHit (GB/T 7714)", () => {
  it("lists up to 3 authors, no 等", () => {
    const s = formatExternalLiteratureHit({
      title: "Biochar soil improvement",
      authors: ["Zhang A", "Li B", "Wang C"],
      year: 2023,
      journal: "Soil Biology",
      volume: "12",
      pages: "34-45",
    });
    expect(s).toContain("Zhang A, Li B, Wang C.");
    expect(s).not.toContain("等");
  });

  it("lists first 3 + 等 for 4+ authors", () => {
    const s = formatExternalLiteratureHit({
      title: "Biochar meta-analysis",
      authors: ["A", "B", "C", "D", "E"],
      year: 2024,
      journal: "Geoderma",
    });
    expect(s).toContain("A, B, C, 等.");
    expect(s).not.toContain("D");
  });

  it("falls back to 佚名 when no authors", () => {
    const s = formatExternalLiteratureHit({ title: "No author paper", authors: [] });
    expect(s).toContain("佚名.");
  });

  it("builds full GB/T line with DOI", () => {
    const s = formatExternalLiteratureHit({
      title: "T",
      authors: ["Zhang A"],
      year: 2022,
      journal: "J Soil",
      volume: "3",
      issue: "1",
      pages: "1-9",
      doi: "10.1000/abc.def,.",
    });
    expect(s).toContain("Zhang A. T[J]. J Soil, 2022, 3(1): 1-9. DOI: 10.1000/abc.def.");
  });
});
