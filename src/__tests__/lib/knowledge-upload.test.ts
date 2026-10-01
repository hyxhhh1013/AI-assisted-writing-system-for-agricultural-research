import { describe, expect, it } from "vitest";
import { KNOWLEDGE_MAX_UPLOAD_BYTES, rejectKnowledgeUpload } from "@/lib/knowledge-upload";

describe("rejectKnowledgeUpload", () => {
  it("rejects non-pdf names", () => {
    expect(rejectKnowledgeUpload({ name: "virus.exe", size: 12, type: "application/octet-stream" }))
      .toEqual({ status: 400, error: "只接受 PDF 文件" });
  });

  it("rejects oversize pdf before it is read", () => {
    const result = rejectKnowledgeUpload({
      name: "big.pdf",
      size: KNOWLEDGE_MAX_UPLOAD_BYTES + 1,
      type: "application/pdf",
    });
    expect(result?.status).toBe(413);
  });

  it("rejects a pdf name with a non-pdf mime", () => {
    expect(rejectKnowledgeUpload({
      name: "paper.pdf",
      size: 20,
      type: "text/html",
    })?.status).toBe(400);
  });

  it("accepts a normal pdf", () => {
    expect(rejectKnowledgeUpload({
      name: "paper.pdf",
      size: 1024,
      type: "application/pdf",
    })).toBeNull();
  });
});
