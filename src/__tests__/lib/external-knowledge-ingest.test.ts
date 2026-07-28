import { describe, expect, it } from "vitest";
import { getKnowledgeIndexStatus } from "@/contracts/knowledge";
import { isSoftGroundable } from "@/lib/reference-evidence";
import { reconstructOpenAlexAbstract } from "@/lib/literature-search";

describe("external abstract ingest helpers", () => {
  it("soft-groundable requires enough abstract text", () => {
    expect(isSoftGroundable("short")).toBe(false);
    expect(isSoftGroundable("x".repeat(80))).toBe(true);
  });

  it("marks abstract-indexed knowledge files", () => {
    const status = getKnowledgeIndexStatus({
      chunkCount: 2,
      size: 0,
      hasPdfOnDisk: false,
      bib: { title: "Biochar soil review" },
    });
    expect(status.label).toBe("摘要已索引");
    expect(status.status).toBe("partial");
  });

  it("marks bib-only without chunks as awaiting PDF", () => {
    const status = getKnowledgeIndexStatus({
      chunkCount: 0,
      size: 0,
      hasPdfOnDisk: false,
      bib: { title: "Some paper" },
    });
    expect(status.label).toBe("待上传 PDF");
  });
});

describe("reconstructOpenAlexAbstract", () => {
  it("rebuilds inverted index to plain text", () => {
    expect(
      reconstructOpenAlexAbstract({
        Biochar: [0],
        effects: [1],
        on: [2],
        soil: [3],
      }),
    ).toBe("Biochar effects on soil");
  });

  it("returns undefined for empty", () => {
    expect(reconstructOpenAlexAbstract(null)).toBeUndefined();
    expect(reconstructOpenAlexAbstract({})).toBeUndefined();
  });
});
