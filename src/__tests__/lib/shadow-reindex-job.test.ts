import { describe, expect, it } from "vitest";
import { shadowReindexRefusal } from "@/lib/shadow-reindex-job";

describe("shadow reindex gate", () => {
  it("allows a category with files at any time", () => {
    expect(shadowReindexRefusal({ category: "热化学", fileCount: 3 })).toBeNull();
  });

  it("refuses a second run and an empty category", () => {
    expect(shadowReindexRefusal({ category: "热化学", fileCount: 3, alreadyRunning: true })?.status).toBe(409);
    expect(shadowReindexRefusal({ category: "", fileCount: 3 })?.status).toBe(400);
    expect(shadowReindexRefusal({ category: "热化学", fileCount: 0 })?.status).toBe(400);
  });
});
