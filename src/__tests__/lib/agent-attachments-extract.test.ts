import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import * as XLSX from "xlsx";
import { extractAttachmentText } from "@/lib/agent/attachments/extract";

function tmpFile(name: string, content: Buffer | string): string {
  const p = path.join(os.tmpdir(), `att-extract-${Date.now()}-${name}`);
  fs.writeFileSync(p, content);
  return p;
}

function makeXlsxFile(name: string): string {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["处理", "温度(°C)", "产率(%)"],
    ["A", 450, 32.5],
    ["B", 500, 41.2],
    ["C", 550, 38.7],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "结果");
  const p = path.join(os.tmpdir(), `att-extract-${Date.now()}-${name}`);
  XLSX.writeFile(wb, p);
  return p;
}

describe("extractAttachmentText", () => {
  it("extracts plain text files", async () => {
    const r = await extractAttachmentText(tmpFile("a.md", "# 标题\n内容"), "a.md");
    expect(r.status).toBe("ready");
    expect(r.text).toContain("标题");
    expect(r.source).toBe("text");
  });

  it("converts CSV to markdown table", async () => {
    const r = await extractAttachmentText(tmpFile("d.csv", "a,b\n1,2\n3,4"), "d.csv");
    expect(r.status).toBe("ready");
    expect(r.text).toContain("| a | b |");
    expect(r.text).toContain("| 1 | 2 |");
    expect(r.source).toBe("csv");
  });

  it("extracts instrument xy as spectrum preview", async () => {
    const r = await extractAttachmentText(tmpFile("s.xy", "20.0 100\n21.0 110\n"), "s.xy");
    expect(r.status).toBe("ready");
    expect(r.source).toBe("spectrum");
    expect(r.text).toMatch(/仪器谱/);
  });

  it("marks unsupported extensions", async () => {
    const r = await extractAttachmentText(tmpFile("x.exe", "MZ"), "x.exe");
    expect(r.status).toBe("unsupported");
  });

  it("extracts xlsx to markdown table", async () => {
    const r = await extractAttachmentText(makeXlsxFile("data.xlsx"), "data.xlsx");
    expect(r.status).toBe("ready");
    expect(r.source).toBe("excel");
    expect(r.text).toContain("结果");
    expect(r.text).toContain("处理");
    expect(r.text).toContain("温度");
    expect(r.text).toContain("产率");
  });

  it("handles empty xlsx gracefully", async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.book_append_sheet(wb, ws, "空");
    const p = path.join(os.tmpdir(), `att-extract-${Date.now()}-empty.xlsx`);
    XLSX.writeFile(wb, p);
    const r = await extractAttachmentText(p, "empty.xlsx");
    expect(r.status).toBe("ready");
    expect(r.text).toBeTruthy();
  });

  it("truncates over-long text and marks truncated", async () => {
    const big = "x".repeat(600_000);
    const r = await extractAttachmentText(tmpFile("big.txt", big), "big.txt");
    expect(r.status).toBe("ready");
    expect(r.truncated).toBe(true);
    expect((r.text?.length ?? 0)).toBeLessThan(500_001);
  });
});
