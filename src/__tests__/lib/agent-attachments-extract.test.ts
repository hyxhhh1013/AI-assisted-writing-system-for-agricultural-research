import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { extractAttachmentText } from "@/lib/agent/attachments/extract";

function tmpFile(name: string, content: Buffer | string): string {
  const p = path.join(os.tmpdir(), `att-extract-${Date.now()}-${name}`);
  fs.writeFileSync(p, content);
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

  it("marks unsupported extensions", async () => {
    const r = await extractAttachmentText(tmpFile("x.exe", "MZ"), "x.exe");
    expect(r.status).toBe("unsupported");
  });

  it("truncates over-long text and marks truncated", async () => {
    const big = "x".repeat(600_000);
    const r = await extractAttachmentText(tmpFile("big.txt", big), "big.txt");
    expect(r.status).toBe("ready");
    expect(r.truncated).toBe(true);
    expect((r.text?.length ?? 0)).toBeLessThan(500_001);
  });
});
