import { afterAll, describe, expect, it } from "vitest";
import { sanitizeAttachmentName, writeAttachmentFile, readAttachmentFile, deleteAttachmentFile } from "@/lib/agent/attachments/storage";
import fs from "fs";
import os from "os";
import path from "path";

/** 临时根目录，避免测试写入真实 data/attachments（对齐 rag-embedding-bin.test.ts 惯例） */
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-attachment-test-"));

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("attachment storage", () => {
  it("sanitizes unsafe filenames", () => {
    expect(sanitizeAttachmentName("../../etc/passwd.pdf")).toBe("passwd.pdf");
    expect(sanitizeAttachmentName("报告(1).pdf")).toBe("报告(1).pdf");
    expect(sanitizeAttachmentName("a\\b\\c.md")).toBe("c.md");
    expect(sanitizeAttachmentName("..")).toBe("file");
    expect(sanitizeAttachmentName("")).toBe("file");
  });

  it("writes and reads back a file under the per-attachment dir", () => {
    const fileKey = writeAttachmentFile("u1", "att1", "报告.pdf", Buffer.from("hello"), tempRoot);
    expect(fileKey).toContain("att1");
    // fileKey 是落库标识，必须纯 posix（跨平台一致），不含反斜杠
    expect(fileKey).not.toContain("\\");
    expect(fs.existsSync(path.join(tempRoot, fileKey))).toBe(true);
    expect(readAttachmentFile("u1", "att1", tempRoot).toString("utf8")).toBe("hello");
  });

  it("deleteAttachmentFile removes the dir", () => {
    writeAttachmentFile("u1", "att2", "a.txt", Buffer.from("x"), tempRoot);
    deleteAttachmentFile("u1", "att2", tempRoot);
    expect(fs.existsSync(path.join(tempRoot, "data", "attachments", "u1", "att2"))).toBe(false);
  });
});
