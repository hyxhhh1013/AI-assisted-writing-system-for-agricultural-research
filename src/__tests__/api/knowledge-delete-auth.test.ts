import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  deleteMany: vi.fn(),
  invalidateBibCache: vi.fn(),
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/prisma", () => ({
  default: { knowledgeFile: { deleteMany: mocks.deleteMany, findMany: vi.fn(), count: vi.fn() } },
}));

vi.mock("@/lib/rag", () => ({
  localRAG: {},
  invalidateBibCache: mocks.invalidateBibCache,
}));

vi.mock("fs", () => ({
  default: { existsSync: mocks.existsSync, unlinkSync: mocks.unlinkSync },
  existsSync: mocks.existsSync,
  unlinkSync: mocks.unlinkSync,
}));

import { DELETE } from "@/app/api/knowledge/route";

function makeReq(url: string) {
  return new NextRequest(url, { method: "DELETE", headers: { "x-user-id": "u1" } });
}

describe("DELETE /api/knowledge admin gate", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
    mocks.deleteMany.mockReset();
    mocks.existsSync.mockReturnValue(false);
  });

  it("rejects non-admin with 403", async () => {
    mocks.requireAdmin.mockResolvedValue({
      error: NextResponse.json({ error: "无管理员权限" }, { status: 403 }),
      user: null,
    });
    const res = await DELETE(makeReq("http://localhost/api/knowledge?name=a.pdf&category=未分类"));
    expect(res.status).toBe(403);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("allows admin to delete", async () => {
    mocks.requireAdmin.mockResolvedValue({
      error: null,
      user: { id: "u1", email: "a@b.c", name: "a", role: "admin" },
    });
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(makeReq("http://localhost/api/knowledge?name=a.pdf&category=未分类"));
    expect(res.status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalled();
  });
});
