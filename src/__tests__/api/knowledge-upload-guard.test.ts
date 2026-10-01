import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: { knowledgeFile: { upsert: vi.fn(), findMany: vi.fn(), count: vi.fn(), deleteMany: vi.fn() } },
}));
vi.mock("@/lib/rag", () => ({ localRAG: {}, invalidateBibCache: vi.fn() }));
vi.mock("fs", () => ({
  default: { existsSync: vi.fn(() => true), mkdirSync: vi.fn(), writeFileSync: vi.fn(), unlinkSync: vi.fn() },
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import { POST } from "@/app/api/knowledge/route";

function upload(file: File) {
  const form = new FormData();
  form.set("file", file);
  form.set("category", "未分类");
  return new NextRequest("http://localhost/api/knowledge", { method: "POST", body: form });
}

describe("POST /api/knowledge upload guard", () => {
  it("returns 400 for a non-pdf", async () => {
    const file = new File([new Uint8Array(8)], "virus.exe", { type: "application/octet-stream" });
    const res = await POST(upload(file));
    expect(res.status).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error).toMatch(/PDF/);
  });
});
