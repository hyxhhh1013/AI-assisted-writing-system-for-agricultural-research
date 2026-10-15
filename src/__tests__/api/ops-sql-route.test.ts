import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetOpsRateLimit } from "@/lib/ops-auth";

const TOKEN = "ops-test-token-0123456789abcd";

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
}));

vi.mock("@/lib/ops-sql-run", () => ({
  runOpsSql: mocks.run,
  OpsSqlRejected: class OpsSqlRejected extends Error {},
}));

vi.mock("@/lib/ops-audit", () => ({
  appendOpsAudit: vi.fn(),
}));

import { POST } from "@/app/api/ops/sql/route";

function postSql(body: unknown) {
  return new NextRequest("http://localhost/api/ops/sql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ops/sql", () => {
  beforeEach(() => {
    resetOpsRateLimit();
    mocks.run.mockReset();
    process.env.OPS_MCP_TOKEN = TOKEN;
  });

  afterEach(() => {
    delete process.env.OPS_MCP_TOKEN;
  });

  it("does not run a write without confirm", async () => {
    const res = await POST(postSql({ sql: "DELETE FROM \"AgentSession\" WHERE id = 'x'" }));
    expect(res.status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("runs a select without confirm", async () => {
    mocks.run.mockResolvedValue({ kind: "read", rowCount: 1, rows: [{ id: "a" }] });
    const res = await POST(postSql({ sql: "SELECT id FROM \"AgentSession\" LIMIT 1" }));
    expect(res.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledOnce();
  });
});
