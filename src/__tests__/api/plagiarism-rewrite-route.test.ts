import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  ownedCheck: vi.fn(),
  ownedSuggestion: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("@/lib/plagiarism-access", () => ({
  assertPlagiarismCheckOwnedByUser: mocks.ownedCheck,
  assertRewriteSuggestionOwnedByUser: mocks.ownedSuggestion,
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    plagiarismCheck: { findUnique: mocks.findUnique },
    rewriteSuggestion: { update: mocks.update },
  },
}));

vi.mock("@/services/rewrite-service", () => ({
  generateRewriteSuggestions: mocks.generate,
}));

import { PATCH, POST } from "@/app/api/plagiarism/rewrite/route";

function postReq(userId: string | null, body: Record<string, unknown>) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId) headers["x-user-id"] = userId;
  return new NextRequest("http://localhost/api/plagiarism/rewrite", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function patchReq(userId: string | null, body: Record<string, unknown>) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId) headers["x-user-id"] = userId;
  return new NextRequest("http://localhost/api/plagiarism/rewrite", {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/plagiarism/rewrite", () => {
  beforeEach(() => {
    mocks.ownedCheck.mockReset();
    mocks.ownedSuggestion.mockReset();
    mocks.findUnique.mockReset();
    mocks.update.mockReset();
    mocks.generate.mockReset();
    mocks.ownedCheck.mockResolvedValue(true);
    mocks.ownedSuggestion.mockResolvedValue(true);
    mocks.findUnique.mockResolvedValue({ project: { researchDirection: "茶学" } });
    mocks.generate.mockResolvedValue([
      { id: "s1", strategy: "rephrase", suggestedText: "改写后", similarityAfter: 0.2 },
    ]);
    mocks.update.mockResolvedValue({ id: "s1" });
  });

  it("returns 401 when the request is anonymous", async () => {
    const res = await POST(postReq(null, {
      checkId: "chk-1",
      originalText: "原文段落足够长",
    }));
    expect(res.status).toBe(401);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("returns 403 when the check belongs to someone else", async () => {
    mocks.ownedCheck.mockResolvedValue(false);
    const res = await POST(postReq("user-a", {
      checkId: "chk-other",
      originalText: "原文段落足够长",
    }));
    expect(res.status).toBe(403);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("returns suggestions for the owner", async () => {
    const res = await POST(postReq("user-a", {
      checkId: "chk-1",
      originalText: "原文段落足够长",
    }));
    expect(res.status).toBe(200);
    const json = await res.json() as { suggestions: Array<{ id: string }> };
    expect(json.suggestions[0]?.id).toBe("s1");
    expect(mocks.ownedCheck).toHaveBeenCalledWith("chk-1", "user-a");
  });
});

describe("PATCH /api/plagiarism/rewrite", () => {
  beforeEach(() => {
    mocks.ownedSuggestion.mockReset();
    mocks.update.mockReset();
    mocks.ownedSuggestion.mockResolvedValue(true);
    mocks.update.mockResolvedValue({ id: "s1" });
  });

  it("returns 401 when the request is anonymous", async () => {
    const res = await PATCH(patchReq(null, { suggestionId: "s1", status: "accepted" }));
    expect(res.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns 403 when the suggestion is not owned", async () => {
    mocks.ownedSuggestion.mockResolvedValue(false);
    const res = await PATCH(patchReq("user-a", { suggestionId: "s-other", status: "rejected" }));
    expect(res.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("updates status for the owner", async () => {
    const res = await PATCH(patchReq("user-a", { suggestionId: "s1", status: "accepted" }));
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { status: "accepted" },
    });
  });
});
