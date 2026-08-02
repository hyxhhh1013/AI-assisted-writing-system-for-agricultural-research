import { describe, expect, it } from "vitest";
import { sanitizeAttachmentName, writeAttachmentFile, readAttachmentFile, deleteAttachmentFile } from "@/lib/agent/attachments/storage";
import { resolveProjectRuntimePath } from "@/lib/runtime-paths";
import fs from "fs";
import path from "path";

describe("attachment storage", () => {
  it("sanitizes unsafe filenames", () => {
    expect(sanitizeAttachmentName("../../etc/passwd.pdf")).toBe("passwd.pdf");
    expect(sanitizeAttachmentName("报告(1).pdf")).toBe("报告(1).pdf");
    expect(sanitizeAttachmentName("a\\b\\c.md")).toBe("c.md");
  });

  it("writes and reads back a file under the per-attachment dir", () => {
    const fileKey = writeAttachmentFile("u1", "att1", "报告.pdf", Buffer.from("hello"));
    expect(fileKey).toContain("att1");
    const abs = resolveProjectRuntimePath(fileKey);
    expect(fs.existsSync(abs)).toBe(true);
    expect(readAttachmentFile("u1", "att1").toString("utf8")).toBe("hello");
  });

  it("deleteAttachmentFile removes the dir", () => {
    writeAttachmentFile("u1", "att2", "a.txt", Buffer.from("x"));
    deleteAttachmentFile("u1", "att2");
    expect(fs.existsSync(resolveProjectRuntimePath("data", "attachments", "u1", "att2"))).toBe(false);
  });
});
