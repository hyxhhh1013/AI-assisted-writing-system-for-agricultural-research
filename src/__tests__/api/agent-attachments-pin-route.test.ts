import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  pinAttachment: vi.fn(),
  projectOwned: vi.fn(),
}));

vi.mock("@/lib/agent/attachments/service", () => ({
  pinAttachment: mocks.pinAttachment,
}));

vi.mock("@/lib/prisma", () => ({
  default: { project: { count: mocks.projectOwned } },
}));

import { POST } from "@/app/api/agent/attachments/[id]/pin/route";

const BASE_URL = "http://localhost/api/agent/attachments/a1/pin";

function makeReq(userId: string | null, body: Record<string, unknown>) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId) headers["x-user-id"] = userId;
  return new NextRequest(BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function ctx(id = "a1") {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/agent/attachments/[id]/pin", () => {
  beforeEach(() => {
    process.env.AGENT_ENABLED = "1";
    mocks.pinAttachment.mockReset();
    mocks.projectOwned.mockReset();
    mocks.pinAttachment.mockResolvedValue({ id: "a1", pinned: true, createdAt: "2026-08-02T00:00:00.000Z" });
    mocks.projectOwned.mockResolvedValue(true);
  });

  afterEach(() => {
    delete process.env.AGENT_ENABLED;
    vi.clearAllMocks();
  });

  it("401 without x-user-id", async () => {
    const res = await POST(makeReq(null, { projectId: "p1" }), ctx());
    expect(res.status).toBe(401);
    expect(mocks.pinAttachment).not.toHaveBeenCalled();
  });

  it("400 when projectId is missing", async () => {
    const res = await POST(makeReq("u1", {}), ctx());
    expect(res.status).toBe(400);
    expect(mocks.projectOwned).not.toHaveBeenCalled();
  });

  it("404 when project is not owned by user", async () => {
    mocks.projectOwned.mockResolvedValue(false);
    const res = await POST(makeReq("u1", { projectId: "p1" }), ctx());
    expect(res.status).toBe(404);
    expect(mocks.projectOwned).toHaveBeenCalledWith({ where: { id: "p1", userId: "u1" } });
    expect(mocks.pinAttachment).not.toHaveBeenCalled();
  });

  it("404 when attachment does not exist or is not accessible", async () => {
    mocks.pinAttachment.mockResolvedValue(null);
    const res = await POST(makeReq("u1", { projectId: "p1" }), ctx());
    expect(res.status).toBe(404);
    expect(mocks.pinAttachment).toHaveBeenCalledWith("u1", "a1", "p1");
  });

  it("200 pins attachment to project", async () => {
    const res = await POST(makeReq("u1", { projectId: "p1" }), ctx());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { attachment: { pinned: boolean } };
    expect(json.attachment.pinned).toBe(true);
    expect(mocks.pinAttachment).toHaveBeenCalledWith("u1", "a1", "p1");
  });

  it("500 with fixed error message on server failure", async () => {
    mocks.pinAttachment.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(makeReq("u1", { projectId: "p1" }), ctx());
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("固定失败");
  });
});
