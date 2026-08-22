import { describe, expect, it } from "vitest";
import { getKnowledgeIndexStatus } from "@/contracts/knowledge";
import { isSoftGroundable } from "@/lib/reference-evidence";
import { reconstructOpenAlexAbstract } from "@/lib/literature-search";
import { EXTERNAL_ABSTRACT_CATEGORY } from "@/lib/external-knowledge-ingest";
import {
  inferCategoriesFromTitle,
  inferPrimaryCategoryFromText,
} from "@/lib/knowledge-category-hints";

describe("external abstract ingest helpers", () => {
  it("exports stable external-abstract category name", () => {
    expect(EXTERNAL_ABSTRACT_CATEGORY).toBe("外部摘要");
  });

  it("auto-classifies tobacco / tea / biochar from title hints", () => {
    expect(inferPrimaryCategoryFromText("烤烟烟叶品质形成机制")).toBe("烟草");
    expect(inferCategoriesFromTitle("绿茶香气挥发性成分")).toEqual(["茶学"]);
    expect(inferPrimaryCategoryFromText("Biochar soil amendment review")).toBe("热化学");
  });

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
