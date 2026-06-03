import { describe, expect, it } from "vitest";
import {
  extractFromFilename,
  extractFromFirstPage,
  extractEnglishFromHeaderLines,
  mergeBibEntries,
} from "../../../scripts/extractors/journal.mjs";
import { mergeWithEnrichment } from "../../../scripts/extractors/crossref.mjs";

type JournalBib = {
  title?: string;
  titleHint?: string;
  authors?: string[];
  doi?: string;
  journal?: string;
  firstAuthor?: string;
  year?: number;
};

describe("journal metadata extractors", () => {
  it("extractFromFilename: 纯中文文件名作 titleHint", () => {
    const r = extractFromFilename("含能复合催化剂对微烟推进剂燃烧性能的影响.pdf");
    expect(r.titleHint).toContain("含能复合催化剂");
    expect(r.firstAuthor).toBeUndefined();
  });

  it("extractFromFilename: 年份-作者-标题", () => {
    const r = extractFromFilename("2024-赵凤起-含能复合催化剂研究.pdf");
    expect(r.year).toBe(2024);
    expect(r.firstAuthor).toBe("赵凤起");
  });

  it("extractFromFirstPage: CNKI 题目与作者", () => {
    const compact =
      "题目：含能复合催化剂对微烟推进剂燃烧性能的影响作者：赵凤起，钱某，孙某摘要：本文研究了…";
    const spaced = compact.split("").join(" ");
    const r = extractFromFirstPage(spaced) as JournalBib;
    expect(r.title).toContain("含能复合催化剂");
    expect(r.authors?.length).toBeGreaterThan(0);
  });

  it("extractFromFirstPage: DOI 映射期刊", () => {
    const text = "doi: 10.3969/j.issn.1001-3555.2024.03.012 Abstract ...";
    const r = extractFromFirstPage(text) as JournalBib;
    expect(r.doi).toMatch(/^10\.3969/);
    expect(r.journal).toBe("含能材料");
  });

  it("extractEnglishFromHeaderLines: Elsevier 风格标题与作者", () => {
    const lines = [
      "Fuel",
      "Original research article",
      "Synergistic effects of biochar on soil carbon sequestration",
      "Khan, A., Wang, Y., Liu, Z.",
      "Department of Agronomy, Example University",
      "Abstract",
    ];
    const r = extractEnglishFromHeaderLines(lines) as JournalBib;
    expect(r.title).toContain("Synergistic effects");
    expect(r.authors?.length).toBeGreaterThan(0);
  });

  it("mergeBibEntries: 误识别作者转标题", () => {
    const merged = mergeBibEntries({
      firstAuthor: "Biochar carbon sequestration effects study",
    });
    expect(merged.title).toContain("Biochar");
    expect(merged.firstAuthor).toBeUndefined();
  });

  it("mergeWithEnrichment: Crossref 覆盖弱字段", () => {
    const base = { doi: "10.1038/nature12373", title: "short", firstAuthor: "Biochar" };
    const remote = {
      title: "A long authoritative title from Crossref metadata",
      firstAuthor: "Smith",
      journal: "Nature",
      year: 2013,
    };
    const out = mergeWithEnrichment(base, remote);
    expect(out.title).toContain("authoritative");
    expect(out.journal).toBe("Nature");
  });
});
