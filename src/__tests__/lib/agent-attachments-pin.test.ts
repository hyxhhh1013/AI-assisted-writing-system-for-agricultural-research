import { beforeEach, describe, expect, it, vi } from "vitest";
import { pinAttachment } from "@/lib/agent/attachments/service";
import prisma from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  default: {
    agentAttachment: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue({
        id: "a1", userId: "u1", originalName: "d.csv", mimeType: "text/csv",
        size: 10, status: "ready", extractSource: "csv", pinned: true,
        createdAt: new Date("2026-08-02"),
      }),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pinAttachment", () => {
  it("sets projectId and pinned", async () => {
    const r = await pinAttachment("u1", "a1", "p1");
    expect(r?.pinned).toBe(true);
    expect(prisma.agentAttachment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "a1", userId: "u1" },
    }));
  });

  it("returns null when updateMany affects 0 rows (not found / no access)", async () => {
    vi.mocked(prisma.agentAttachment.updateMany).mockResolvedValueOnce({ count: 0 });
    const r = await pinAttachment("u1", "a1", "p1");
    expect(r).toBeNull();
    expect(prisma.agentAttachment.findUnique).not.toHaveBeenCalled();
  });
});
