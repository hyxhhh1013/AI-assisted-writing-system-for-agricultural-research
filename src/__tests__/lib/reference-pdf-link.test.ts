import { describe, expect, it } from "vitest";
import { isKnowledgePdfName, pickKnowledgePdf } from "@/lib/reference-pdf-link";

describe("pickKnowledgePdf", () => {
  const doi = "10.1016/j.envint.2021.106628";

  it("ignores abstract stubs and zero-byte rows", () => {
    expect(
      pickKnowledgePdf(doi, [
        {
          name: "[摘要] Immobilization.pdf",
          category: "外部摘要",
          size: 0,
          chunkCount: 2,
          bibDoi: doi,
        },
        {
          name: "notes.txt",
          category: "热化学",
          size: 1200,
          chunkCount: 4,
          bibDoi: doi,
        },
      ]),
    ).toBeNull();
  });

  it("prefers the indexed PDF when several files share the DOI", () => {
    expect(
      pickKnowledgePdf(`https://doi.org/${doi}`, [
        {
          name: "unindexed.pdf",
          category: "热化学",
          size: 900_000,
          chunkCount: 0,
          bibDoi: doi.toUpperCase(),
        },
        {
          name: "indexed.pdf",
          category: "热化学",
          size: 100,
          chunkCount: 40,
          bibDoi: doi,
        },
      ]),
    ).toEqual({ name: "indexed.pdf", category: "热化学" });
  });

  it("rejects a different DOI that merely contains the query as a substring", () => {
    expect(
      pickKnowledgePdf(doi, [
        {
          name: "other.pdf",
          category: "热化学",
          size: 10,
          chunkCount: 3,
          bibDoi: `${doi}.supplement`,
        },
      ]),
    ).toBeNull();
  });
});

describe("isKnowledgePdfName", () => {
  it("accepts a pdf basename only", () => {
    expect(isKnowledgePdfName("a.PDF")).toBe(true);
    expect(isKnowledgePdfName("[摘要] title")).toBe(false);
    expect(isKnowledgePdfName(null)).toBe(false);
  });
});
