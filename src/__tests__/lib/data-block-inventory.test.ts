import { describe, expect, it } from "vitest";
import {
  blockFromAgentPick,
  inventorySheetGrids,
  parseAgentTablePicks,
  parseGridKeepingBlanks,
  sliceTableBlock,
  sourceFileNames,
} from "@/lib/data-block-inventory";

describe("data block inventory", () => {
  it("单表保持原文件名", () => {
    const grid = parseGridKeepingBlanks("group,yield\nCK,10\nT1,14\n", ",");
    const blocks = inventorySheetGrids([{ sheetName: "CSV", grid }], "yield.csv");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.sourceFileName).toBe("yield.csv");
    expect(blocks[0]?.headers).toEqual(["group", "yield"]);
    expect(blocks[0]?.rowCount).toBe(2);
    const sliced = sliceTableBlock(grid, blocks[0]!.locator);
    expect(sliced.rows).toEqual([["CK", "10"], ["T1", "14"]]);
  });

  it("空行隔开的两张表各自成块", () => {
    const grid = parseGridKeepingBlanks(
      "group,yield\nA,1\n\n处理,株高\nCK,10\nT,12\n",
      ",",
    );
    const blocks = inventorySheetGrids([{ sheetName: "CSV", grid }], "combo.csv");
    expect(blocks.map((b) => b.headers)).toEqual([
      ["group", "yield"],
      ["处理", "株高"],
    ]);
    expect(blocks.map((b) => b.rowCount)).toEqual([1, 2]);
    expect(blocks[0]?.sourceFileName).toBe("combo.csv · group、yield");
    expect(blocks[1]?.sourceFileName).toContain("株高");
  });

  it("标题行不进表头", () => {
    const grid = [
      ["产量"],
      ["处理", "均值"],
      ["CK", "10"],
      ["T", "14"],
    ];
    const blocks = inventorySheetGrids([{ sheetName: "结果", grid }], "a.xlsx");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.label).toBe("产量");
    expect(blocks[0]?.headers).toEqual(["处理", "均值"]);
    expect(blocks[0]?.rowCount).toBe(2);
  });

  it("多个工作表分别列出", () => {
    const sheets = [
      { sheetName: "产量", grid: [["处理", "值"], ["CK", "1"]] },
      { sheetName: "株高", grid: [["处理", "值"], ["CK", "2"]] },
    ];
    const blocks = inventorySheetGrids(sheets, "book.xlsx");
    expect(blocks.map((b) => b.sheetName)).toEqual(["产量", "株高"]);
    expect(new Set(blocks.map((b) => b.sourceFileName)).size).toBe(2);
  });

  it("并排表按两列空档切开，单格空洞不切", () => {
    const side = inventorySheetGrids([{
      sheetName: "S",
      grid: [
        ["处理", "产量", "", "", "处理", "株高"],
        ["CK", "10", "", "", "CK", "20"],
      ],
    }], "side.xlsx");
    expect(side).toHaveLength(2);
    expect(side[0]?.headers).toEqual(["处理", "产量"]);
    expect(side[1]?.headers).toEqual(["处理", "株高"]);

    const merged = inventorySheetGrids([{
      sheetName: "S",
      grid: [
        ["处理", "产量", "", "株高"],
        ["CK", "10", "", "20"],
      ],
    }], "one.xlsx");
    expect(merged).toHaveLength(1);
    expect(merged[0]?.headers).toEqual(["处理", "产量", "株高"]);
  });

  it("仪器参数区不进清单，谱的表头是单位行", () => {
    const grid = [
      ["", "", "", "", "", "", "", "Acquisition Parameters :"],
      ["", "", "", "", "", "", "", "Total acquisition time", "55.3 secs"],
      ["", "", "", "", "", "", "", "Source Gun Type", "Al K Alpha"],
      ["", "", "", "", "", "", "", "Number of Energy Steps", "221"],
      ["", "", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", ""],
      ["Binding Energy (E)", "", ""],
      ["eV", "", "Counts / s"],
      ["542.9", "", "11459.4"],
      ["542.8", "", "11378.8"],
      ["542.7", "", "11373.6"],
    ];
    const blocks = inventorySheetGrids([{ sheetName: "O1s Scan", grid }], "1.xlsx");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.label).toBe("Binding Energy (E)");
    expect(blocks[0]?.headers).toEqual(["eV", "Counts / s"]);
    expect(blocks[0]?.preview[0]).toEqual(["542.9", "11459.4"]);
    expect(blocks[0]?.rowCount).toBe(3);
  });

  it("谱名行下面才是表头，重复列名用上一行的系列名", () => {
    const grid = [
      ["Binding Energy (E)", "", "", "Fe2p3 Scan A", "Fe2p1 Scan A"],
      ["eV", "", "Counts / s", "Counts / s", "Counts / s"],
      ["738.9", "", "9889", "10047", "10041"],
      ["738.8", "", "9980", "10048", "10042"],
    ];
    const blocks = inventorySheetGrids([{ sheetName: "Fe2p Scan", grid }], "1.xlsx");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.headers).toEqual(["eV", "Counts / s", "Fe2p3 Scan A", "Fe2p1 Scan A"]);
    expect(blocks[0]?.preview[0]?.[0]).toBe("738.9");
  });

  it("没有表头的两列数字整段保留", () => {
    const grid = [
      ["3995.9", "0.998"],
      ["3993.8", "0.997"],
      ["3991.7", "0.996"],
    ];
    const blocks = inventorySheetGrids([{ sheetName: "Fe升序", grid }], "1.xlsx");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.label).toBe("Fe升序");
    expect(blocks[0]?.headers).toEqual(["x", "y"]);
    expect(blocks[0]?.rowCount).toBe(3);
    expect(blocks[0]?.locator.headerless).toBe(true);
  });

  it("助手点名的行和列才进入确认，参数区不会被自动收进去", () => {
    const grid = [
      ["Acquisition Parameters :", ""],
      ["Total acquisition time", "55.3 secs"],
      ["", ""],
      ["eV", "Counts / s"],
      ["542.9", "11459.4"],
      ["542.8", "11378.8"],
    ];
    const parsed = parseAgentTablePicks(JSON.stringify([{
      label: "O1s",
      note: "结合能对计数，不要写成均值",
      sheet: "O1s Scan",
      headerRow: 4,
      columns: [1, 2],
    }]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const built = blockFromAgentPick([{ sheetName: "O1s Scan", grid }], "1.xlsx", parsed.items[0]!);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.block.headers).toEqual(["eV", "Counts / s"]);
    expect(built.block.preview[0]).toEqual(["542.9", "11459.4"]);
    expect(built.block.rowCount).toBe(2);
    expect(built.note).toContain("不要写成均值");
  });

  it("sourceFileNames 单块不改名", () => {
    expect(sourceFileNames("a.csv", ["产量"])).toEqual(["a.csv"]);
  });

  it("数字段中间的表头另成一块，前面的数字保留", () => {
    const grid = [
      ["1316.4271", "0.003272", "0.003215", "1243.1376"],
      ["1356.3315", "0.00004", "0.000024", "0.998287"],
      ["539.486", "0.999971", "0.998275", "0.031009"],
      ["9.015", "相对压力 P/Po", "log(Po/P)^2", "Harkins and Jura"],
      ["1321.2981", "0.857808", "0.011952", "49.156597"],
      ["", "0.880833", "0.072808", "49.151604"],
    ];
    const blocks = inventorySheetGrids([{ sheetName: "Sheet1", grid }], "Mo-BC.XLSX");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.locator.headerless).toBe(true);
    expect(blocks[0]?.rowCount).toBe(3);
    expect(blocks[1]?.headers.some((header) => header.includes("相对压力"))).toBe(true);
    expect(blocks[1]?.preview[0]?.some((cell) => cell.includes("0.857808"))).toBe(true);
  });
});
