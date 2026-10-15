import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetOpsRateLimit } from "@/lib/ops-auth";

const TOKEN = "ops-test-token-0123456789abcd";
const SESSION_ID = "cmuntp1ls0001";

const mocks = vi.hoisted(() => ({
  interrupt: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/lib/ops-queries", () => ({
  interruptOpsSession: mocks.interrupt,
  getOpsSession: mocks.getSession,
}));

vi.mock("@/lib/ops-audit", () => ({
  appendOpsAudit: vi.fn(),
}));

import { POST } from "@/app/api/ops/sessions/[id]/route";

function postReq(body: unknown, authorization = `Bearer ${TOKEN}`) {
  return new NextRequest(`http://localhost/api/ops/sessions/${SESSION_ID}`, {
    method: "POST",
    headers: { authorization, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ops/sessions/:id", () => {
  beforeEach(() => {
    resetOpsRateLimit();
    mocks.interrupt.mockReset();
    mocks.getSession.mockReset();
    process.env.OPS_MCP_TOKEN = TOKEN;
    mocks.interrupt.mockResolvedValue({ interrupted: true });
  });

  afterEach(() => {
    delete process.env.OPS_MCP_TOKEN;
  });

  it("does not write when confirm is missing", async () => {
    const res = await POST(postReq({ action: "interrupt" }), { params: Promise.resolve({ id: SESSION_ID }) });
    expect(res.status).toBe(400);
    expect(mocks.interrupt).not.toHaveBeenCalled();
  });

  it("does not write when confirm is false", async () => {
    const res = await POST(
      postReq({ action: "interrupt", confirm: false }),
      { params: Promise.resolve({ id: SESSION_ID }) },
    );
    expect(res.status).toBe(400);
    expect(mocks.interrupt).not.toHaveBeenCalled();
  });

  it("interrupts a running session after confirm", async () => {
    const res = await POST(
      postReq({ action: "interrupt", confirm: true }),
      { params: Promise.resolve({ id: SESSION_ID }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; data: { status: string } };
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("interrupted");
    expect(mocks.interrupt).toHaveBeenCalledWith(SESSION_ID);
  });

  it("rejects a session that is not running", async () => {
    mocks.interrupt.mockResolvedValue({ interrupted: false });
    const res = await POST(
      postReq({ action: "interrupt", confirm: true }),
      { params: Promise.resolve({ id: SESSION_ID }) },
    );
    expect(res.status).toBe(400);
  });
});
