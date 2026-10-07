import { describe, expect, it } from "vitest";
import { shadowReindexRefusal } from "@/lib/shadow-reindex-job";

describe("shadow reindex gate", () => {
  const night = new Date("2026-10-07T16:30:00.000Z");
  const day = new Date("2026-10-07T14:00:00.000Z");

  it("refuses daytime even when a category has files", () => {
    expect(shadowReindexRefusal({ category: "热化学", fileCount: 3, now: day })).toEqual({
      status: 409,
      error: "不在深夜窗口 00:30–05:00（北京时间），未开始。线上索引未改。",
    });
  });

  it("allows one category inside the night window", () => {
    expect(shadowReindexRefusal({ category: "热化学", fileCount: 3, now: night })).toBeNull();
  });

  it("refuses a second run and an empty category", () => {
    expect(shadowReindexRefusal({ category: "热化学", fileCount: 3, now: night, alreadyRunning: true })?.status).toBe(409);
    expect(shadowReindexRefusal({ category: "", fileCount: 3, now: night })?.status).toBe(400);
    expect(shadowReindexRefusal({ category: "热化学", fileCount: 0, now: night })?.status).toBe(400);
  });
});
