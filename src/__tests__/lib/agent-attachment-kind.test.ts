import { describe, expect, it } from "vitest";
import {
  formatAttachmentChipBadge,
  inferAttachmentKind,
} from "@/lib/agent/attachments/kind";
import { lookupIngestView } from "@/lib/agent/attachments/auto-ingest";
import { serializeDataClaims, serializeDataSources } from "@/contracts/project";
import type { DataSourceAnalysis, EvidenceClaim } from "@/contracts/data-source";

describe("inferAttachmentKind", () => {
  it("识别表格 / 仪器 / 图片 / 文档", () => {
    expect(inferAttachmentKind("yield.csv")).toBe("tabular");
    expect(inferAttachmentKind("data.XLSX")).toBe("tabular");
    expect(inferAttachmentKind("sample.xy")).toBe("instrument");
    expect(inferAttachmentKind("scan.ras")).toBe("instrument");
    expect(inferAttachmentKind("fig.png")).toBe("image");
    expect(inferAttachmentKind("paper.pdf")).toBe("document");
  });
});

describe("formatAttachmentChipBadge", () => {
  it("表格已入库显示声明数", () => {
    expect(
      formatAttachmentChipBadge({
        kind: "tabular",
        extractStatus: "ready",
        ingest: { status: "ingested", claimCount: 12 },
      }),
    ).toBe("已入库 · 12 条声明");
  });

  it("表格失败显示分析失败", () => {
    expect(
      formatAttachmentChipBadge({
        kind: "tabular",
        extractStatus: "ready",
        ingest: { status: "failed", error: "空表" },
      }),
    ).toBe("分析失败");
  });

  it("文献/图片不显示入库徽章", () => {
    expect(
      formatAttachmentChipBadge({
        kind: "document",
        extractStatus: "ready",
        ingest: { status: "skipped" },
      }),
    ).toBeNull();
  });
});

describe("lookupIngestView", () => {
  it("同 fileName 已在项目里则视为已入库", () => {
    const source: DataSourceAnalysis = {
      fileName: "yield.csv",
      rowCount: 3,
      columns: [{ name: "yield", type: "numeric", count: 3 }],
      stats: [],
      generatedAt: 1,
    };
    const claims: EvidenceClaim[] = [
      {
        id: "D-yield-C1",
        sourceId: "D-yield",
        sourceType: "data",
        type: "mean",
        text: "均值",
        values: { mean: 1 },
        variables: ["yield"],
        tolerance: 5,
      },
    ];
    const view = lookupIngestView(
      "yield.csv",
      serializeDataSources([source]),
      serializeDataClaims(claims),
    );
    expect(view?.status).toBe("ingested");
    expect(view?.claimCount).toBe(1);
  });

  it("项目里没有该文件则返回 null", () => {
    expect(lookupIngestView("other.csv", "[]", "[]")).toBeNull();
  });
});
