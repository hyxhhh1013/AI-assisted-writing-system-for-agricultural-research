import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function req(path: string, method: "GET" | "POST" = "GET") {
  return new NextRequest(new URL(path, "http://localhost:3000"), { method });
}

describe("proxy SEC-02 protected routes", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-proxy-tests";
    delete process.env.AUTH_BYPASS;
  });

  it("returns 401 for unauthenticated POST /api/data/analyze", async () => {
    const res = await proxy(req("/api/data/analyze", "POST"));
    expect(res.status).toBe(401);
  });

  it("returns 401 for unauthenticated GET /api/figures/registry", async () => {
    const res = await proxy(req("/api/figures/registry"));
    expect(res.status).toBe(401);
  });

  it("returns 401 for unauthenticated GET /api/presentation/stats", async () => {
    const res = await proxy(req("/api/presentation/stats"));
    expect(res.status).toBe(401);
  });

  it("returns 401 for unauthenticated POST /api/review", async () => {
    const res = await proxy(req("/api/review", "POST"));
    expect(res.status).toBe(401);
  });

  it("does not rate-limit unauthenticated GET /api/knowledge", async () => {
    const res = await proxy(req("/api/knowledge"));
    expect(res.status).not.toBe(429);
  });

  it("does not rate-limit GET /api/agent/sessions for authenticated-shaped requests", async () => {
    process.env.AUTH_BYPASS = "true";
    for (let i = 0; i < 25; i++) {
      const res = await proxy(req("/api/agent/sessions?projectId=x", "GET"));
      expect(res.status).not.toBe(429);
    }
  });
});
