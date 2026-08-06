import { describe, expect, it } from "vitest";
import { mapAdminKnowledgeFile } from "@/lib/admin-knowledge-map";

describe("mapAdminKnowledgeFile", () => {
  it("maps unindexed file", () => {
    const row = mapAdminKnowledgeFile({
      id: "1",
      name: "test.pdf",
      category: "未分类",
      documentType: "paper",
      size: 1024,
      mtime: null,
      bib: null,
      bibEdited: false,
      parseWarning: null,
      chunkCount: 0,
      chunkRowCount: 0,
    });
    expect(row.indexStatus).toBe("unindexed");
    expect(row.doi).toBeNull();
  });

  it("parses bib doi", () => {
    const row = mapAdminKnowledgeFile({
      id: "2",
      name: "paper.pdf",
      category: "水稻",
      documentType: "paper",
      size: 2048,
      mtime: new Date("2024-01-01"),
      bib: JSON.stringify({ title: "Rice", doi: "10.1234/test", firstAuthor: "Zhang" }),
      bibEdited: false,
      parseWarning: null,
      chunkCount: 12,
      chunkRowCount: 12,
    });
    expect(row.doi).toBe("10.1234/test");
    expect(row.indexStatus).toBe("ready");
  });
});
