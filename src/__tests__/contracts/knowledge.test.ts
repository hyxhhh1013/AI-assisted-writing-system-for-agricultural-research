import { describe, expect, it } from "vitest";
import {
  filterKnowledgeFiles,
  getKnowledgeDisplayTitle,
  getKnowledgeIndexStatus,
  getKnowledgeMetricsLine,
  getKnowledgeVolumeIssueLine,
  normalizeKnowledgeDoiUrl,
} from "@/contracts/knowledge";

describe("getKnowledgeIndexStatus", () => {
  it("marks unindexed files when chunkCount is zero", () => {
    const info = getKnowledgeIndexStatus({ chunkCount: 0, bib: null, size: 1024 });
    expect(info.status).toBe("unindexed");
  });

  it("marks bibliography-only imports as awaiting PDF upload", () => {
    const info = getKnowledgeIndexStatus({
      chunkCount: 0,
      size: 0,
      bib: { title: "Imported reference" },
    });
    expect(info.status).toBe("partial");
    expect(info.label).toBe("待上传 PDF");
  });

  it("marks partial when chunks exist but bib is missing", () => {
    const info = getKnowledgeIndexStatus({
      chunkCount: 12,
      documentType: "paper",
      bib: null,
    });
    expect(info.status).toBe("partial");
    expect(info.missingFields).toContain("标题");
  });

  it("marks ready when user corrected bib", () => {
    const info = getKnowledgeIndexStatus({
      chunkCount: 8,
      bibEdited: true,
      bib: { title: "手动标题" },
    });
    expect(info.status).toBe("ready");
    expect(info.label).toBe("已校正");
  });

  it("marks scan-only PDFs without text layer", () => {
    const info = getKnowledgeIndexStatus({
      chunkCount: 0,
      parseWarning: "no_text",
      bib: null,
    });
    expect(info.label).toBe("无文本层");
  });
});

describe("getKnowledgeDisplayTitle", () => {
  it("prefers bib title over filename", () => {
    expect(
      getKnowledgeDisplayTitle({
        name: "abc.pdf",
        bib: { title: "Biochar pyrolysis" },
      }),
    ).toBe("Biochar pyrolysis");
  });
});

describe("getKnowledgeVolumeIssueLine", () => {
  it("formats volume issue and pages", () => {
    expect(
      getKnowledgeVolumeIssueLine({ volume: "12", issue: "3", pages: "100-110" }),
    ).toBe("12(3):100-110");
  });
});

describe("normalizeKnowledgeDoiUrl", () => {
  it("prefixes bare doi with doi.org", () => {
    expect(normalizeKnowledgeDoiUrl("10.1234/abc")).toBe("https://doi.org/10.1234/abc");
  });

  it("returns null for empty", () => {
    expect(normalizeKnowledgeDoiUrl("  ")).toBeNull();
  });
});

describe("getKnowledgeMetricsLine", () => {
  it("joins IF and quartile", () => {
    expect(
      getKnowledgeMetricsLine({
        impactFactor: 5.2,
        impactFactorYear: 2024,
        jcrQuartile: "Q1",
      }),
    ).toBe("IF 5.2 · Q1");
  });

  it("returns null when no metrics", () => {
    expect(getKnowledgeMetricsLine(null)).toBeNull();
  });
});

describe("filterKnowledgeFiles", () => {
  const sample = [
    {
      name: "a.pdf",
      category: "c",
      chunkCount: 5,
      size: 1,
      mtime: "",
      bib: { journal: "Nature", doi: "10.1/a", title: "T", firstAuthor: "X" },
    },
    {
      name: "b.pdf",
      category: "c",
      chunkCount: 0,
      size: 1,
      mtime: "",
      bib: { journal: "Science", title: "T2" },
    },
  ];

  it("filters by journal contains", () => {
    const out = filterKnowledgeFiles(sample, { journalContains: "nat" });
    expect(out).toHaveLength(1);
    expect(out[0]?.name).toBe("a.pdf");
  });

  it("filters by has doi", () => {
    const out = filterKnowledgeFiles(sample, { doi: "has" });
    expect(out).toHaveLength(1);
  });

  it("filters by unindexed status", () => {
    const out = filterKnowledgeFiles(sample, { indexStatus: "unindexed" });
    expect(out).toHaveLength(1);
    expect(out[0]?.name).toBe("b.pdf");
  });
});
