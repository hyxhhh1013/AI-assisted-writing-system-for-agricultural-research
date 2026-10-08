import { describe, expect, it } from "vitest";
import type { DataSourceAnalysis } from "@/contracts/data-source";
import {
  buildTableSnapshot,
  originalTabularName,
  previewFromGrids,
  storedTableDetail,
} from "@/lib/data-table-snapshot";

describe("originalTabularName", () => {
  it("strips the block label added at ingest", () => {
    expect(originalTabularName("1.xlsx · Binding Energy (E) #4")).toBe("1.xlsx");
    expect(originalTabularName("红外整合.xlsx")).toBe("红外整合.xlsx");
  });
});

describe("buildTableSnapshot", () => {
  it("keeps a head and a tail when the table is long", () => {
    const rows = Array.from({ length: 50 }, (_, i) => [String(i), String(i + 1)]);
    const snap = buildTableSnapshot(["波数", "强度"], rows, { maxRows: 4 });
    expect(snap.preview).toHaveLength(4);
    expect(snap.preview[0]).toEqual(["0", "1"]);
    expect(snap.previewTail?.[1]?.[0]).toBe("49");
    expect(snap.rowCount).toBe(50);
  });
});

describe("previewFromGrids", () => {
  it("returns the block whose stored name matches", () => {
    const grid = [
      ["样品", "产量"],
      ["A", "1.2"],
      ["B", "3.4"],
    ];
    const snap = previewFromGrids(
      [{ sheetName: "CSV", grid }],
      "yield.csv",
      ["样品", "产量"],
    );
    expect(snap?.matched).toBe("block");
    expect(snap?.preview[0]).toEqual(["A", "1.2"]);
  });

  it("finds a header row by column name when the old split name is gone", () => {
    const grid = [
      ["仪器参数", ""],
      ["Total acquisition time", "3 min"],
      ["Binding Energy (E)", "Counts / s"],
      ["710.0", "1200"],
      ["709.5", "1180"],
    ];
    const snap = previewFromGrids(
      [{ sheetName: "Fe2p Scan", grid }],
      "1.xlsx · 已废弃切块",
      ["Binding Energy (E)", "Counts / s"],
    );
    expect(snap?.matched).toBe("columns");
    expect(snap?.headers[0]).toBe("Binding Energy (E)");
    expect(snap?.preview[0]?.[0]).toBe("710.0");
    expect(snap?.sheetName).toBe("Fe2p Scan");
  });
});

describe("storedTableDetail", () => {
  it("reads the preview saved on the analysis", () => {
    const source: DataSourceAnalysis = {
      fileName: "a.csv",
      rowCount: 2,
      columns: [
        { name: "样品", type: "group", count: 2 },
        { name: "产量", type: "numeric", count: 2 },
      ],
      stats: [],
      generatedAt: 1,
      previewHeaders: ["样品", "产量"],
      preview: [["A", "1.2"]],
    };
    expect(storedTableDetail(source)?.preview[0]).toEqual(["A", "1.2"]);
  });
});
