import { describe, expect, it } from "vitest";
import {
  getKnowledgeDisplayTitle,
  getKnowledgeIndexStatus,
} from "@/contracts/knowledge";

describe("getKnowledgeIndexStatus", () => {
  it("marks unindexed files when chunkCount is zero", () => {
    const info = getKnowledgeIndexStatus({ chunkCount: 0, bib: null });
    expect(info.status).toBe("unindexed");
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
