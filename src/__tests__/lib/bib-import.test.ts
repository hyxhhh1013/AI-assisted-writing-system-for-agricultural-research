import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { parseBibtex } from "@/lib/bib-import/parse-bibtex";
import { parseRis } from "@/lib/bib-import/parse-ris";
import { findPdfMatchForTitle, normalizeTitleKey } from "@/lib/bib-import/match-pdf";
import { generateBibliographyFileName } from "@/lib/bib-import/import-names";
import { detectBibliographyFormat } from "@/lib/bib-import/detect-format";

const fixtureDir = path.join(process.cwd(), "src/__tests__/fixtures");

describe("parseRis", () => {
  it("parses sample.ris with DOI and Chinese title", () => {
    const content = fs.readFileSync(path.join(fixtureDir, "sample.ris"), "utf-8");
    const entries = parseRis(content);
    expect(entries.length).toBe(2);
    expect(entries[0]?.bib.title).toContain("Biochar effects");
    expect(entries[0]?.bib.doi).toBe("10.1016/j.soilbio.2020.107823");
    expect(entries[0]?.bib.year).toBe(2020);
    expect(entries[0]?.bib.authors?.length).toBe(2);
    expect(entries[1]?.bib.title).toContain("水稻秸秆");
  });
});

describe("parseBibtex", () => {
  it("parses sample.bib article and book", () => {
    const content = fs.readFileSync(path.join(fixtureDir, "sample.bib"), "utf-8");
    const entries = parseBibtex(content);
    expect(entries.length).toBe(2);
    expect(entries[0]?.documentType).toBe("journal");
    expect(entries[0]?.bib.doi).toBe("10.1016/j.biortech.2021.124456");
    expect(entries[1]?.documentType).toBe("book");
    expect(entries[1]?.bib.isbn).toBe("978-0123456789");
  });
});

describe("detectBibliographyFormat", () => {
  it("detects bib from extension", () => {
    expect(detectBibliographyFormat("refs.bib", "")).toBe("bibtex");
    expect(detectBibliographyFormat("refs.ris", "")).toBe("ris");
  });
});

describe("findPdfMatchForTitle", () => {
  it("matches similar titles against existing PDF bib titles", () => {
    const match = findPdfMatchForTitle("Biochar effects on soil nitrogen cycling", [
      { name: "2020-wang-biochar.pdf", size: 1024, bib: { title: "Biochar effects on soil nitrogen cycling" } },
      { name: "other.pdf", size: 512, bib: { title: "Unrelated paper" } },
    ]);
    expect(match).toBe("2020-wang-biochar.pdf");
  });

  it("normalizes titles for comparison", () => {
    expect(normalizeTitleKey("Biochar-Effects!!!")).toBe("biochar effects");
  });
});

describe("generateBibliographyFileName", () => {
  it("creates unique placeholder names", () => {
    const taken = new Set<string>(["[书目] Test.pdf"]);
    const name = generateBibliographyFileName("Test", taken);
    expect(name).toBe("[书目] Test (2).pdf");
  });
});
