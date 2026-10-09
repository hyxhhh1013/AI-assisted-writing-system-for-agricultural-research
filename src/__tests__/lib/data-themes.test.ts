import { describe, expect, it } from "vitest";
import type { DataSourceAnalysis } from "@/contracts/data-source";
import { proposeDataThemes } from "@/lib/data-themes";

function source(fileName: string, cells: string[][]): DataSourceAnalysis {
  return {
    fileName,
    rowCount: cells.length,
    columns: (cells[0] ?? []).map((name) => ({ name, type: "numeric" as const, count: cells.length })),
    stats: [],
    generatedAt: 1,
    previewHeaders: cells[0],
    preview: cells.slice(1),
  };
}

describe("proposeDataThemes", () => {
  it("把多个文件里对得上的孔结构收成一个主题，单独的 XRD 先不并", () => {
    const pore = (file: string): DataSourceAnalysis => source(file, [
      ["列1", "1316.4271", "1356.3315"],
      ["9.015", "相对压力 P/Po", "Harkins and Jura"],
      ["1321.2981", "0.857808", "49.156597"],
    ]);
    const files = [
      "Cu-BC.XLSX",
      "Cu-HZSM5.XLSX",
      "Fe-BC.XLSX",
      "Fe-HZSM5.XLSX",
      "Mo-BC.XLSX",
      "Mo-HZSM5.XLSX",
    ];
    const report = proposeDataThemes([
      ...files.map(pore),
      source("O1s.xlsx", [["Binding Energy (E)"], ["542.9", "11459"]]),
    ]);
    expect(report.themes.map((theme) => theme.title)).toEqual(["孔结构等温线"]);
    expect(report.themes[0]?.members.map((member) => member.sample)).toEqual([
      "Cu-BC",
      "Cu-HZSM5",
      "Fe-BC",
      "Fe-HZSM5",
      "Mo-BC",
      "Mo-HZSM5",
    ]);
    expect(report.unassigned.map((item) => item.file)).toEqual(["O1s.xlsx"]);
    expect(report.unassigned[0]?.reason).toContain("只有这一份");
  });

  it("两份 XRD 收成主题，没有同类表头的留在未归入", () => {
    const report = proposeDataThemes([
      source("Cu-BC.XLSX", [["2θ", "intensity"], ["10", "20"]]),
      source("Fe-BC.XLSX", [["2θ", "intensity"], ["12", "18"]]),
      source("notes.csv", [["处理", "产量"], ["CK", "10"]]),
    ]);
    expect(report.themes).toHaveLength(1);
    expect(report.themes[0]?.title).toBe("XRD");
    expect(report.unassigned.map((item) => item.file)).toEqual(["notes.csv"]);
    expect(report.unassigned[0]?.reason).toContain("没有和其他文件对上");
  });
});
