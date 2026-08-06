import { describe, expect, it, vi } from "vitest";
import { readAttachmentTool } from "@/lib/agent/tools/read-attachment";
import { listAttachmentsTool } from "@/lib/agent/tools/list-attachments";
import prisma from "@/lib/prisma";
import type { AgentContext } from "@/lib/agent/types";

vi.mock("@/lib/prisma", () => ({ default: { agentAttachment: { findFirst: vi.fn(), findMany: vi.fn() } } }));

function ctx(userId = "u1", sessionId = "s1"): AgentContext {
  return {
    userId,
    sessionId,
    signal: new AbortController().signal,
    budget: { maxIterations: 32, currentIteration: 0, maxToolCalls: 64, toolCallCount: 0 },
  };
}

/** 无 sessionId / 无 projectId 的上下文（list_attachments 空 OR 守卫用） */
function noScopeCtx(): AgentContext {
  return {
    userId: "u1",
    signal: new AbortController().signal,
    budget: { maxIterations: 32, currentIteration: 0, maxToolCalls: 64, toolCallCount: 0 },
  };
}

const mockFindFirst = prisma.agentAttachment.findFirst as unknown as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.agentAttachment.findMany as unknown as ReturnType<typeof vi.fn>;

describe("readAttachmentTool", () => {
  it("returns a window with offset pagination", async () => {
    mockFindFirst.mockResolvedValue({
      id: "a1", userId: "u1", sessionId: "s1", projectId: null, pinned: false,
      status: "ready", originalName: "r.txt", extractedText: "一二三四五六七八九",
    });
    const r = await readAttachmentTool.execute({ fileId: "a1", offset: 2, maxChars: 4 }, ctx());
    expect(r.success).toBe(true);
    expect((r.data as { text: string }).text).toBe("三四五六");
  });

  it("rejects attachment owned by another user", async () => {
    mockFindFirst.mockResolvedValue({
      id: "a1", userId: "other", sessionId: "s1", projectId: null, pinned: false,
      status: "ready", originalName: "r.txt", extractedText: "x",
    });
    const r = await readAttachmentTool.execute({ fileId: "a1" }, ctx());
    expect(r.success).toBe(false);
  });

  it("tail part reads the last window", async () => {
    mockFindFirst.mockResolvedValue({
      id: "a1", userId: "u1", sessionId: "s1", projectId: null, pinned: false,
      status: "ready", originalName: "r.txt", extractedText: "0123456789",
    });
    const r = await readAttachmentTool.execute({ fileId: "a1", part: "tail", maxChars: 3 }, ctx());
    expect(r.success).toBe(true);
    expect((r.data as { text: string }).text).toBe("789");
  });

  it("rejects attachment still extracting", async () => {
    mockFindFirst.mockResolvedValue({
      id: "a1", userId: "u1", sessionId: "s1", projectId: null, pinned: false,
      status: "extracting", originalName: "r.txt", extractedText: null,
    });
    const r = await readAttachmentTool.execute({ fileId: "a1" }, ctx());
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/提取中/);
  });

  it("coerces string numeric params and honors offset=0 over tail", async () => {
    mockFindFirst.mockResolvedValue({
      id: "a1", userId: "u1", sessionId: "s1", projectId: null, pinned: false,
      status: "ready", originalName: "r.txt", extractedText: "0123456789",
    });
    const r = await readAttachmentTool.execute(
      { fileId: "a1", part: "tail", offset: 0, maxChars: "4" },
      ctx(),
    );
    expect(r.success).toBe(true);
    expect((r.data as { text: string }).text).toBe("0123");
  });

  it("clamps an out-of-bounds offset instead of returning a bogus empty window", async () => {
    mockFindFirst.mockResolvedValue({
      id: "a1", userId: "u1", sessionId: "s1", projectId: null, pinned: false,
      status: "ready", originalName: "r.txt", extractedText: "0123456789",
    });
    const r = await readAttachmentTool.execute({ fileId: "a1", offset: 100, maxChars: 3 }, ctx());
    expect(r.success).toBe(true);
    expect((r.data as { text: string }).text).toBe("9");
  });

  it("lets a project-pinned attachment be read from another session of the same project", async () => {
    mockFindFirst.mockResolvedValue({
      id: "a1", userId: "u1", sessionId: "s-other", projectId: "p1", pinned: true,
      status: "ready", originalName: "r.txt", extractedText: "跨会话可读",
    });
    const r = await readAttachmentTool.execute({ fileId: "a1" }, {
      ...ctx("u1", "s-current"),
      projectId: "p1",
    });
    expect(r.success).toBe(true);
    expect((r.data as { text: string }).text).toBe("跨会话可读");
  });

  it("rejects a project-pinned attachment when read outside its project", async () => {
    mockFindFirst.mockResolvedValue({
      id: "a1", userId: "u1", sessionId: "s1", projectId: "p1", pinned: true,
      status: "ready", originalName: "r.txt", extractedText: "x",
    });
    const r = await readAttachmentTool.execute({ fileId: "a1" }, {
      ...ctx("u1", "s-current"),
      projectId: "p2",
    });
    expect(r.success).toBe(false);
  });
});

describe("listAttachmentsTool", () => {
  it("returns attachments with projected shape", async () => {
    mockFindMany.mockResolvedValue([
      { id: "a1", originalName: "r.txt", status: "ready", extractSource: "text", extractedText: "abc", pinned: false },
      { id: "a2", originalName: "d.csv", status: "extract_failed", extractSource: null, extractedText: null, pinned: true },
    ]);
    const r = await listAttachmentsTool.execute({}, ctx());
    expect(r.success).toBe(true);
    expect((r.data as { attachments: unknown[] }).attachments).toEqual([
      { id: "a1", name: "r.txt", status: "ready", source: "text", chars: 3, pinned: false },
      { id: "a2", name: "d.csv", status: "extract_failed", source: null, chars: 0, pinned: true },
    ]);
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 30 }));
  });

  it("returns empty without querying when no session/project scope", async () => {
    mockFindMany.mockClear();
    const r = await listAttachmentsTool.execute({}, noScopeCtx());
    expect(r.success).toBe(true);
    expect((r.data as { attachments: unknown[] }).attachments).toEqual([]);
    expect(r.summary).toMatch(/当前无附件/);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("reports returned-first when capped at take=30", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `a${i}`, originalName: `f${i}.txt`, status: "ready", extractSource: "text",
      extractedText: "x", pinned: false,
    }));
    mockFindMany.mockResolvedValue(many);
    const r = await listAttachmentsTool.execute({}, ctx());
    expect(r.success).toBe(true);
    expect(r.summary).toMatch(/返回前 30 个/);
  });
});
