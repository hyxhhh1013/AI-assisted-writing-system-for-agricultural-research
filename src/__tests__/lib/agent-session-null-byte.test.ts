import { describe, expect, it, vi, beforeEach } from "vitest";
import { emptyAgentSessionSnapshot } from "@/contracts/agent-session";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: { agentSession: { update: mocks.update } },
}));

import { saveAgentSessionSnapshot, stripNullBytes } from "@/lib/agent/session-store";

beforeEach(() => {
  mocks.update.mockReset();
  mocks.update.mockResolvedValue({});
});

describe("stripNullBytes", () => {
  it("去掉嵌套字符串里的 U+0000，其余字符保留", () => {
    const cleaned = stripNullBytes({
      goal: "大纲\u0000确认",
      notes: ["蓝图\u0000", 1, null],
      nested: { text: "a\u0000b" },
    });
    expect(cleaned).toEqual({
      goal: "大纲确认",
      notes: ["蓝图", 1, null],
      nested: { text: "ab" },
    });
  });
});

describe("saveAgentSessionSnapshot", () => {
  it("入库前清掉快照和 errorMessage 里的空字节", async () => {
    const snapshot = emptyAgentSessionSnapshot("写引言");
    snapshot.messages[0] = { role: "user", content: "含\u0000空字节" };
    snapshot.awaitingCheckpoint = {
      id: "cp1",
      kind: "outline_approve",
      title: "确认\u0000大纲",
      message: "请确认",
    };

    await saveAgentSessionSnapshot("s1", snapshot, "interrupted", "失败\u0000原因");

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({
        status: "interrupted",
        errorMessage: "失败原因",
      }),
    });
    const saved = mocks.update.mock.calls[0][0].data.snapshot as {
      messages: { content: string }[];
      awaitingCheckpoint: { title: string };
    };
    expect(saved.messages[0].content).toBe("含空字节");
    expect(saved.awaitingCheckpoint.title).toBe("确认大纲");
    expect(JSON.stringify(saved)).not.toContain("\\u0000");
  });
});
