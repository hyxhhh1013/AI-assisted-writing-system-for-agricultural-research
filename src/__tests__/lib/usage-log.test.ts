import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    aiUsageLog: {
      create: vi.fn().mockRejectedValue(new Error("db unavailable in test")),
    },
  },
}));

import { usageLog } from "@/lib/usage-log";

describe("usageLog", () => {
  beforeEach(() => {
    usageLog.clear();
  });

  it("records in-memory entries", () => {
    usageLog.record("ai:deepseek", { model: "deepseek-v4-flash", provider: "deepseek" }, "user-1");
    usageLog.record("ai:zhipu", { model: "glm-4" }, "user-2");

    const stats = usageLog.stats();
    expect(stats["ai:deepseek"]).toBe(1);
    expect(stats["ai:zhipu"]).toBe(1);

    const recent = usageLog.recent(10);
    expect(recent).toHaveLength(2);
    expect(recent[0]?.feature).toBe("ai:zhipu");
  });

  it("defaults userId to anonymous", () => {
    usageLog.record("test:feature");
    const recent = usageLog.recent(1);
    expect(recent[0]?.userId).toBe("anonymous");
  });
});
