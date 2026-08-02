import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "path";
import { createAttachmentFromFile } from "@/lib/agent/attachments/service";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findFirst: vi.fn(),
  extract: vi.fn(),
  write: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: { agentAttachment: { create: mocks.create, findFirst: mocks.findFirst } },
}));

vi.mock("@/lib/agent/attachments/extract", () => ({
  extractAttachmentText: mocks.extract,
}));

vi.mock("@/lib/agent/attachments/storage", () => ({
  deleteAttachmentFile: mocks.remove,
  readAttachmentFile: vi.fn(),
  writeAttachmentFile: mocks.write,
}));

const FILE_KEY = "data/attachments/u1/att-1/hello.txt";

function fakeFile(name: string, content: string, mime = "text/plain"): File {
  return new File([content], name, { type: mime });
}

beforeEach(() => {
  mocks.create.mockReset();
  mocks.create.mockResolvedValue({
    id: "att-1",
    originalName: "hello.txt",
    mimeType: "text/plain",
    size: 5,
    status: "ready",
    extractSource: "text",
    pinned: false,
    createdAt: new Date("2026-08-02T00:00:00Z"),
  });
  mocks.extract.mockReset();
  mocks.extract.mockResolvedValue({ status: "ready", text: "hello", source: "text" });
  mocks.write.mockReset();
  mocks.write.mockReturnValue(FILE_KEY);
  mocks.remove.mockReset();
});

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

  it("writes file, extracts text and persists row on happy path", async () => {
    const result = await createAttachmentFromFile("u1", "s1", fakeFile("hello.txt", "hello"));

    expect(mocks.write).toHaveBeenCalledWith("u1", expect.any(String), "hello.txt", expect.any(Buffer));
    expect(mocks.extract).toHaveBeenCalledWith(path.join(process.cwd(), FILE_KEY), "hello.txt");
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        id: expect.any(String),
        userId: "u1",
        sessionId: "s1",
        fileKey: FILE_KEY,
        originalName: "hello.txt",
        mimeType: "text/plain",
        size: 5,
        status: "ready",
        extractSource: "text",
        extractedText: "hello",
      },
    });
    expect(result).toMatchObject({
      id: "att-1",
      originalName: "hello.txt",
      status: "ready",
      extractSource: "text",
      charCount: 5,
      truncated: false,
      pinned: false,
    });
  });

  it("deletes the on-disk file when db insert fails", async () => {
    mocks.create.mockRejectedValueOnce(new Error("db down"));
    await expect(
      createAttachmentFromFile("u1", "s1", fakeFile("hello.txt", "hello")),
    ).rejects.toThrow("db down");
    expect(mocks.remove).toHaveBeenCalledWith("u1", expect.any(String));
  });
});
