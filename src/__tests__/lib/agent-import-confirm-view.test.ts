import { describe, expect, it } from "vitest";
import {
  literatureLandingUrl,
  parseImportConfirmItems,
} from "@/lib/agent/import-confirm-view";

describe("parseImportConfirmItems", () => {
  it("keeps abstract and authors from a valid hit", () => {
    const items = parseImportConfirmItems([
      {
        id: "doi:10.1/x",
        title: "Catalytic pyrolysis",
        authors: ["Zhang"],
        year: 2024,
        journal: "JAAP",
        doi: "10.1/x",
        abstract: "Reviews biomass catalytic pyrolysis.",
        source: "openalex",
        isOpenAccess: true,
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.abstract).toBe("Reviews biomass catalytic pyrolysis.");
    expect(items[0]?.authors).toEqual(["Zhang"]);
  });

  it("falls back when schema fields are missing", () => {
    const items = parseImportConfirmItems([
      { title: "No id paper", abstract: "Short note.", doi: "10.2/y" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("doi:10.2/y");
    expect(items[0]?.abstract).toBe("Short note.");
  });

  it("returns empty for non-arrays", () => {
    expect(parseImportConfirmItems(undefined)).toEqual([]);
    expect(parseImportConfirmItems({})).toEqual([]);
  });
});

describe("literatureLandingUrl", () => {
  it("prefers OA url then DOI", () => {
    expect(
      literatureLandingUrl({
        id: "1",
        title: "A",
        authors: [],
        source: "openalex",
        openAccessUrl: "https://oa.example/pdf",
        doi: "10.1/x",
      }),
    ).toBe("https://oa.example/pdf");
    expect(
      literatureLandingUrl({
        id: "1",
        title: "A",
        authors: [],
        source: "openalex",
        doi: "https://doi.org/10.1/x",
      }),
    ).toBe("https://doi.org/10.1/x");
  });
});
