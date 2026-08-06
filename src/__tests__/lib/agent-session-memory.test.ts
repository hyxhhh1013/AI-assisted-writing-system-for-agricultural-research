import { describe, expect, it } from "vitest";
import { appendMemoryToBriefing } from "@/lib/agent/session-memory";

describe("session-memory", () => {
  it("appends memory block after briefing", () => {
    const out = appendMemoryToBriefing("标题：测试", "【近期对话记忆】\n- [完成] 写引言");
    expect(out).toContain("标题：测试");
    expect(out).toContain("近期对话记忆");
    expect(out).toContain("写引言");
  });

  it("returns memory alone when briefing empty", () => {
    expect(appendMemoryToBriefing("", "mem")).toBe("mem");
  });
});
