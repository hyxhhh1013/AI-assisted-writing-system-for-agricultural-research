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

  it("marks truncated ready attachments", () => {
    const info: AgentAttachmentInfo[] = [{
      id: "a3", originalName: "long.txt", mimeType: "text/plain",
      size: 9999, status: "ready", extractSource: "text", charCount: 500_000, truncated: true,
      pinned: false, createdAt: "2026-08-02T00:00:00Z",
    }];
    const text = buildAttachmentManifest(info);
    expect(text).toContain("已截断");
    expect(text).toContain('read_attachment("a3")');
  });

  it("marks extracting status", () => {
    const info: AgentAttachmentInfo[] = [{
      id: "a4", originalName: "draft.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 1024, status: "extracting", pinned: false, createdAt: "2026-08-02T00:00:00Z",
    }];
    expect(buildAttachmentManifest(info)).toContain("提取中");
  });

  it("marks unsupported status", () => {
    const info: AgentAttachmentInfo[] = [{
      id: "a5", originalName: "data.zip", mimeType: "application/zip",
      size: 2048, status: "unsupported", pinned: false, createdAt: "2026-08-02T00:00:00Z",
    }];
    expect(buildAttachmentManifest(info)).toContain("不支持的类型");
  });

  it("ingested tabular points to plot/write instead of ingest", () => {
    const info: AgentAttachmentInfo[] = [{
      id: "a6", originalName: "yield.csv", mimeType: "text/csv",
      size: 80, status: "ready", extractSource: "csv", charCount: 40, truncated: false,
      kind: "tabular", ingest: { status: "ingested", claimCount: 4 },
      pinned: false, createdAt: "2026-08-15T00:00:00Z",
    }];
    const text = buildAttachmentManifest(info);
    expect(text).toContain("已入库");
    expect(text).toContain("list_plot_sources");
    expect(text).toMatch(/不必再 ingest_project_data/);
  });

  it("empty returns empty string", () => {
    expect(buildAttachmentManifest([])).toBe("");
  });
});
