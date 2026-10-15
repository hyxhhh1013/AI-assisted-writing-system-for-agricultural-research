import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { opsTokenMatches, resetOpsRateLimit } from "@/lib/ops-auth";

const TOKEN = "ops-test-token-0123456789abcd";

const mocks = vi.hoisted(() => ({
  health: vi.fn(),
}));

vi.mock("@/lib/ops-queries", () => ({
  loadOpsHealth: mocks.health,
}));

import { GET } from "@/app/api/ops/health/route";

function healthReq(authorization?: string) {
  const headers: Record<string, string> = {};
  if (authorization) headers.authorization = authorization;
  return new NextRequest("http://localhost/api/ops/health", { headers });
}

describe("GET /api/ops/health", () => {
  beforeEach(() => {
    resetOpsRateLimit();
    mocks.health.mockReset();
    mocks.health.mockResolvedValue({ db: { connected: true } });
    process.env.OPS_MCP_TOKEN = TOKEN;
  });

  afterEach(() => {
    delete process.env.OPS_MCP_TOKEN;
  });

  it("stays closed when the token is not configured", async () => {
    delete process.env.OPS_MCP_TOKEN;
    const res = await GET(healthReq(`Bearer ${TOKEN}`));
    expect(res.status).toBe(503);
    expect(mocks.health).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong bearer", async () => {
    const missing = await GET(healthReq());
    expect(missing.status).toBe(401);
    const wrong = await GET(healthReq("Bearer not-the-real-token-0123456789"));
    expect(wrong.status).toBe(401);
    expect(mocks.health).not.toHaveBeenCalled();
  });

  it("returns health for the matching bearer", async () => {
    const res = await GET(healthReq(`Bearer ${TOKEN}`));
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; data: { db: { connected: boolean } } };
    expect(body.success).toBe(true);
    expect(body.data.db.connected).toBe(true);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("compares tokens without treating a prefix as equal", () => {
    expect(opsTokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(opsTokenMatches(TOKEN.slice(0, -1), TOKEN)).toBe(false);
  });
});
