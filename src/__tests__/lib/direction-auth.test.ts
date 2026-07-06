import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  default: {
    direction: {
      findFirst: vi.fn(),
    },
  },
}));

import prisma from "@/lib/prisma";
import {
  requireDirectionUser,
  getOwnedDirection,
  requireOwnedDirection,
} from "@/lib/direction-auth";

function mockRequest(userId: string | null): NextRequest {
  return {
    headers: new Headers(userId ? { "x-user-id": userId } : {}),
  } as NextRequest;
}

describe("direction-auth", () => {
  beforeEach(() => {
    vi.mocked(prisma.direction.findFirst).mockReset();
  });

  it("requireDirectionUser returns 401 when no userId", () => {
    const result = requireDirectionUser(mockRequest(null));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("requireDirectionUser returns userId when present", () => {
    const result = requireDirectionUser(mockRequest("user-1"));
    expect(result).toEqual({ ok: true, userId: "user-1" });
  });

  it("getOwnedDirection scopes by slug and userId", async () => {
    vi.mocked(prisma.direction.findFirst).mockResolvedValue({ id: "d1" } as never);
    const row = await getOwnedDirection("biochar", "user-1");
    expect(row).toEqual({ id: "d1" });
    expect(prisma.direction.findFirst).toHaveBeenCalledWith({
      where: { slug: "biochar", userId: "user-1" },
    });
  });

  it("requireOwnedDirection returns 404 when not owned", async () => {
    vi.mocked(prisma.direction.findFirst).mockResolvedValue(null);
    const result = await requireOwnedDirection(mockRequest("user-1"), "missing");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(404);
    }
  });
});
