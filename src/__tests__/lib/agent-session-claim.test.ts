import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: { agentSession: { updateMany: mocks.updateMany, findFirst: mocks.findFirst } },
}));

import { tryAcquireAgentSession } from "@/lib/agent/session-store";

function runningRow() {
  return {
    id: "s1",
    goal: "g",
    status: "running",
    projectId: null,
    directionSlug: null,
    snapshot: null,
    errorMessage: null,
  };
}

beforeEach(() => {
  mocks.updateMany.mockReset();
  mocks.findFirst.mockReset();
});

describe("tryAcquireAgentSession（原子抢占执行权，防并发双跑）", () => {
  it("acquired：会话为 interrupted/error 时原子置 running", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    const r = await tryAcquireAgentSession("s1", "u1");
    expect(r).toBe("acquired");
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", userId: "u1", status: { in: ["interrupted", "error"] } },
      data: { status: "running", errorMessage: null },
    });
  });

  it("conflict：会话已 running（并发请求或僵尸未回收）", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findFirst.mockResolvedValue(runningRow());
    const r = await tryAcquireAgentSession("s1", "u1");
    expect(r).toBe("conflict");
  });

  it("not_found：会话不存在或无权限", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findFirst.mockResolvedValue(null);
    const r = await tryAcquireAgentSession("s1", "u1");
    expect(r).toBe("not_found");
  });

  it("goal 选项：跟聊时原子写入新 goal 且允许 completed 源状态", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    await tryAcquireAgentSession("s1", "u1", {
      goal: "  新目标  ",
      fromStatuses: ["completed", "interrupted", "error"],
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", userId: "u1", status: { in: ["completed", "interrupted", "error"] } },
      data: { goal: "新目标", status: "running", errorMessage: null },
    });
  });

  it("completed 会话在默认 fromStatuses 下不可续跑（需走跟聊）", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findFirst.mockResolvedValue({ ...runningRow(), status: "completed" });
    const r = await tryAcquireAgentSession("s1", "u1");
    expect(r).toBe("conflict");
  });
});
