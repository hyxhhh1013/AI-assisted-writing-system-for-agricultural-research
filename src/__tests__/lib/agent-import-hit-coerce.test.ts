import { describe, expect, it } from "vitest";
import { coerceExternalHitCandidate } from "@/lib/agent/tools/import-reference";
import { externalLiteratureHitSchema } from "@/lib/validations";

describe("coerceExternalHitCandidate", () => {
  it("fills id from doi when Agent omits id", () => {
    const coerced = coerceExternalHitCandidate({
      title: "Biochar Impacts on Soil Physical Properties",
      authors: ["Atanu Mukherjee", "Rattan Lal"],
      year: 2013,
      journal: "Agronomy",
      doi: "10.3390/agronomy3020313",
      source: "openalex",
      abstract: "x".repeat(80),
    });
    const parsed = externalLiteratureHitSchema.safeParse(coerced);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe("doi:10.3390/agronomy3020313");
    }
  });

  it("keeps existing id", () => {
    const coerced = coerceExternalHitCandidate({
      id: "openalex:W123",
      title: "T",
      authors: [],
      source: "openalex",
      doi: "10.1/x",
    });
    const parsed = externalLiteratureHitSchema.safeParse(coerced);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe("openalex:W123");
    }
  });

  it("normalizes invalid source aliases to openalex enum", () => {
    for (const source of ["OpenAlex", "Google Scholar", "scopus", "S2", "Semantic Scholar"]) {
      const coerced = coerceExternalHitCandidate({
        title: "Biochar heavy metal review",
        authors: ["A"],
        doi: "10.1000/test",
        source,
      });
      const parsed = externalLiteratureHitSchema.safeParse(coerced);
      expect(parsed.success, String(source)).toBe(true);
      if (parsed.success) {
        expect(["openalex", "semantic-scholar", "crossref", "pubmed"]).toContain(
          parsed.data.source,
        );
      }
    }
  });

  it("accepts hits without abstract when id+source+title present", () => {
    const coerced = coerceExternalHitCandidate({
      id: "doi:10.1/x",
      title: "T",
      authors: ["A"],
      year: 2020,
      journal: "J",
      doi: "10.1/x",
      source: "crossref",
    });
    expect(externalLiteratureHitSchema.safeParse(coerced).success).toBe(true);
  });
});
