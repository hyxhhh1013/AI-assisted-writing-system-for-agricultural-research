import { describe, expect, it } from "vitest";
import { buildAttachmentManifest } from "@/lib/agent/attachments/manifest";
import type { AgentAttachmentInfo } from "@/contracts/agent-attachment";

describe("buildAttachmentManifest", () => {
  it("lists ready attachments with usage hint", () => {
    const info: AgentAttachmentInfo[] = [{
      id: "a1", originalName: "report.pdf", mimeType: "application/pdf",
      size: 1000, status: "ready", extractSource: "pdf", charCount: 3200, truncated: false,
      pinned: false, createdAt: "2026-08-02T00:00:00Z",
    }];
    const text = buildAttachmentManifest(info);
    expect(text).toContain("report.pdf");
    expect(text).toContain('read_attachment("a1")');
    expect(text).toContain("3200");
  });

  it("marks failed extraction", () => {
    const info: AgentAttachmentInfo[] = [{
      id: "a2", originalName: "图1.png", mimeType: "image/png",
      size: 500, status: "extract_failed", pinned: false, createdAt: "2026-08-02T00:00:00Z",
    }];
    expect(buildAttachmentManifest(info)).toContain("未提取成功");
  });

  it("empty returns empty string", () => {
    expect(buildAttachmentManifest([])).toBe("");
  });
});
