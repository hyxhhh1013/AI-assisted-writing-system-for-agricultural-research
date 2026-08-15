import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "path";
import { createAttachmentFromFile } from "@/lib/agent/attachments/service";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  delete: vi.fn(),
  extract: vi.fn(),
  write: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    agentAttachment: {
      create: mocks.create,
      findFirst: mocks.findFirst,
      findUnique: mocks.findUnique,
      update: mocks.update,
      updateMany: mocks.updateMany,
      delete: mocks.delete,
    },
  },
}));

vi.mock("@/lib/agent/attachments/extract", () => ({
  extractAttachmentText: mocks.extract,
}));

vi.mock("@/lib/agent/attachments/storage", () => ({
  deleteAttachmentFile: mocks.remove,
  readAttachmentFile: vi.fn(),
  writeAttachmentFile: mocks.write,
}));

vi.mock("@/lib/agent/attachments/auto-ingest", () => ({
  autoIngestAfterExtract: vi.fn(async () => null),
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
    status: "extracting",
    extractSource: null,
    pinned: false,
    createdAt: new Date("2026-08-02T00:00:00Z"),
  });
  mocks.extract.mockReset();
  mocks.extract.mockResolvedValue({ status: "ready", text: "hello", source: "text" });
  mocks.write.mockReset();
  mocks.write.mockReturnValue(FILE_KEY);
  mocks.remove.mockReset();
  // 后台提取完成后会 update 记录（fire-and-forget，不阻塞断言）
  mocks.update.mockReset();
  mocks.update.mockResolvedValue({});
  mocks.findUnique.mockReset();
  mocks.findUnique.mockResolvedValue({ projectId: null });
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

  it("writes file, persists extracting row and kicks off background extraction on happy path", async () => {
    const result = await createAttachmentFromFile("u1", "s1", fakeFile("hello.txt", "hello"));

    expect(mocks.write).toHaveBeenCalledWith("u1", expect.any(String), "hello.txt", expect.any(Buffer));
    // 异步提取设计：先落库 extracting，提取结果由后台 update 补写（上传不阻塞）
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        id: expect.any(String),
        userId: "u1",
        sessionId: "s1",
        fileKey: FILE_KEY,
        originalName: "hello.txt",
        mimeType: "text/plain",
        size: 5,
        status: "extracting",
        extractSource: null,
        extractedText: null,
      },
    });
    expect(result).toMatchObject({
      id: "att-1",
      originalName: "hello.txt",
      status: "extracting",
      pinned: false,
    });
    // 后台提取应触发（fire-and-forget）：extract 已调用，且最终 update 补写提取结果
    // （update 的 where.id 是运行时随机 UUID，此处只断言 data 载荷）
    expect(mocks.extract).toHaveBeenCalledWith(path.join(process.cwd(), FILE_KEY), "hello.txt");
    await vi.waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "ready",
            extractSource: "text",
            extractedText: "hello",
          }),
        }),
      );
    });
  });

  it("stores projectId for tabular auto-ingest without pinning", async () => {
    await createAttachmentFromFile("u1", "s1", fakeFile("yield.csv", "a,b\n1,2"), "proj-1");
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "proj-1",
        originalName: "yield.csv",
      }),
    });
    const data = mocks.create.mock.calls[0][0].data as { pinned?: boolean };
    expect(data.pinned).toBeUndefined();
  });

  it("deletes the on-disk file when db insert fails", async () => {
    mocks.create.mockRejectedValueOnce(new Error("db down"));
    await expect(
      createAttachmentFromFile("u1", "s1", fakeFile("hello.txt", "hello")),
    ).rejects.toThrow("db down");
    expect(mocks.remove).toHaveBeenCalledWith("u1", expect.any(String));
  });
});
