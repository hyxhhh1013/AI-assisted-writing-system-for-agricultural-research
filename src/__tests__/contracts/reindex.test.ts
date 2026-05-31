import { describe, expect, it } from "vitest";
import type { ReindexRequest } from "@/contracts/reindex";

function parseReindexBody(body: unknown): ReindexRequest {
  if (body == null || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  const files = Array.isArray(record.files)
    ? record.files.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : undefined;
  return {
    files: files && files.length > 0 ? files : undefined,
    forceStage1: record.forceStage1 === true,
    forceStage3: record.forceStage3 === true,
  };
}

describe("ReindexRequest", () => {
  it("accepts single-file force stage1", () => {
    const parsed = parseReindexBody({
      files: ["paper.pdf"],
      forceStage1: true,
    });
    expect(parsed).toEqual({
      files: ["paper.pdf"],
      forceStage1: true,
      forceStage3: false,
    });
  });

  it("ignores empty files array", () => {
    const parsed = parseReindexBody({ files: [], forceStage3: true });
    expect(parsed.files).toBeUndefined();
    expect(parsed.forceStage3).toBe(true);
  });
});
