import { describe, expect, it, vi } from "vitest";
import { createAttachmentFromFile } from "@/lib/agent/attachments/service";

vi.mock("@/lib/prisma", () => ({ default: { agentAttachment: { create: vi.fn(), findFirst: vi.fn() } } }));

function fakeFile(name: string, content: string, mime = "text/plain"): File {
  return new File([content], name, { type: mime });
}

describe("createAttachmentFromFile", () => {
  it("rejects oversize files", async () => {
    await expect(
      createAttachmentFromFile("u1", "s1", fakeFile("big.pdf", "x".repeat(21 * 1024 * 1024))),
    ).rejects.toThrow(/过大/);
  });

  it("rejects disallowed extension", async () => {
    await expect(
      createAttachmentFromFile("u1", "s1", fakeFile("evil.exe", "MZ")),
    ).rejects.toThrow(/不支持/);
  });
});
