import { describe, expect, it, vi } from "vitest";
import { readAttachmentTool } from "@/lib/agent/tools/read-attachment";
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

describe("readAttachmentTool", () => {
  it("returns a window with offset pagination", async () => {
    (prisma.agentAttachment.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "a1", userId: "u1", sessionId: "s1", projectId: null, pinned: false,
      status: "ready", originalName: "r.txt", extractedText: "一二三四五六七八九",
    });
    const r = await readAttachmentTool.execute({ fileId: "a1", offset: 2, maxChars: 4 }, ctx());
    expect(r.success).toBe(true);
    expect((r.data as { text: string }).text).toBe("三四五六");
  });

  it("rejects attachment owned by another user", async () => {
    (prisma.agentAttachment.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "a1", userId: "other", sessionId: "s1", projectId: null, pinned: false,
      status: "ready", originalName: "r.txt", extractedText: "x",
    });
    const r = await readAttachmentTool.execute({ fileId: "a1" }, ctx());
    expect(r.success).toBe(false);
  });

  it("tail part reads the last window", async () => {
    (prisma.agentAttachment.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "a1", userId: "u1", sessionId: "s1", projectId: null, pinned: false,
      status: "ready", originalName: "r.txt", extractedText: "0123456789",
    });
    const r = await readAttachmentTool.execute({ fileId: "a1", part: "tail", maxChars: 3 }, ctx());
    expect(r.success).toBe(true);
    expect((r.data as { text: string }).text).toBe("789");
  });
});
