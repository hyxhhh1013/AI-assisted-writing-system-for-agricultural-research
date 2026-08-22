import { describe, expect, it, vi } from "vitest";
import {
  normalizeExternalSearchQuery,
  parseDoiFromQuery,
  searchExternalLiterature,
} from "@/lib/literature-search";
import { formatExternalLiteratureHit } from "@/lib/external-literature-format";

describe("parseDoiFromQuery", () => {
  it("parses bare DOI", () => {
    expect(parseDoiFromQuery("10.1038/nature12373")).toBe("10.1038/nature12373");
  });

  it("parses doi.org URL", () => {
    expect(parseDoiFromQuery("https://doi.org/10.1016/j.soilbio.2020.108123")).toBe(
      "10.1016/j.soilbio.2020.108123",
    );
  });

  it("returns null for keyword", () => {
    expect(parseDoiFromQuery("biochar soil")).toBeNull();
  });
});

describe("normalizeExternalSearchQuery", () => {
  it("splits slash compounds so OpenAlex can match", () => {
    expect(normalizeExternalSearchQuery("biochar/pretreatment")).toBe(
      "biochar pretreatment",
    );
    expect(normalizeExternalSearchQuery("生物炭／预处理")).toBe("生物炭 预处理");
  });
});

describe("formatExternalLiteratureHit", () => {
  it("formats GB/T line with DOI", () => {
    const line = formatExternalLiteratureHit({
      title: "Biochar effects",
      authors: ["Zhang L", "Wang M"],
      year: 2021,
      journal: "Soil Biology",
      volume: "152",
      issue: "3",
      pages: "1-10",
      doi: "10.1016/example",
    });
    expect(line).toContain("Zhang L, Wang M.");
    expect(line).toContain("[J].");
    expect(line).toContain("DOI: 10.1016/example");
  });
});

describe("searchExternalLiterature", () => {
  it("merges results from multiple sources", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.openalex.org/works?")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "https://openalex.org/W1",
                display_name: "Merged Paper Alpha",
                publication_year: 2020,
                cited_by_count: 12,
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("semanticscholar.org")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                paperId: "s2-1",
                title: "Merged Paper Alpha",
                authors: [{ name: "A Author" }],
                year: 2020,
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("crossref.org")) {
        return new Response(
          JSON.stringify({
            message: {
              items: [
                {
                  DOI: "10.5555/alpha",
                  title: ["Other Paper"],
                  author: [{ family: "Beta", given: "B" }],
                  published: { "date-parts": [[2019]] },
                },
              ],
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("esearch.fcgi")) {
        return new Response(JSON.stringify({ esearchresult: { idlist: ["999"] } }), {
          status: 200,
        });
      }
      if (url.includes("esummary.fcgi")) {
        return new Response(
          JSON.stringify({
            result: {
              uids: ["999"],
              999: {
                uid: "999",
                title: "PubMed Paper",
                authors: [{ name: "C Author" }],
                pubdate: "2018",
              },
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const hits = await searchExternalLiterature("biochar", { limit: 10 });
    expect(hits.length).toBeGreaterThanOrEqual(2);

    const sources = new Set(hits.flatMap((h) => h.sources ?? [h.source]));
    expect(sources.size).toBeGreaterThanOrEqual(2);

    vi.unstubAllGlobals();
  });
});
