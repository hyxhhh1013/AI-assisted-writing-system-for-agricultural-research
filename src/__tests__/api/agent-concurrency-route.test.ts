import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  isAgentEnabled: vi.fn(),
  createAgentContext: vi.fn(),
  createAgentTools: vi.fn(),
  runAgentLoop: vi.fn(),
  getAgentSessionForUser: vi.fn(),
  reclaimStaleRunningSessions: vi.fn(),
  interruptRunningSession: vi.fn(),
  snapshotToInitialState: vi.fn(),
  tryAcquireAgentSession: vi.fn(),
  createAgentSession: vi.fn(),
}));

vi.mock("@/lib/agent", () => ({
  isAgentEnabled: mocks.isAgentEnabled,
  createAgentContext: mocks.createAgentContext,
  createAgentTools: mocks.createAgentTools,
  runAgentLoop: mocks.runAgentLoop,
}));

vi.mock("@/lib/agent/session-store", () => ({
  createAgentSession: mocks.createAgentSession,
  getAgentSessionForUser: mocks.getAgentSessionForUser,
  reclaimStaleRunningSessions: mocks.reclaimStaleRunningSessions,
  interruptRunningSession: mocks.interruptRunningSession,
  snapshotToInitialState: mocks.snapshotToInitialState,
  tryAcquireAgentSession: mocks.tryAcquireAgentSession,
}));

vi.mock("@/lib/prisma", () => ({
  default: { agentAttachment: { updateMany: vi.fn(), findMany: vi.fn() } },
}));

import { POST } from "@/app/api/agent/route";

const BASE_URL = "http://localhost/api/agent";

function makeReq(userId: string | null, body: Record<string, unknown>) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId) headers["x-user-id"] = userId;
  return new NextRequest(BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function snapSession(status: string) {
  return {
    id: "s1",
    goal: "旧目标",
    status,
    projectId: null,
    directionSlug: null,
    snapshot: {
      goal: "旧目标",
      messages: [],
      iteration: 1,
      toolCallCount: 2,
      plan: null,
      events: [],
      finished: false,
      error: null,
    },
    errorMessage: null,
  };
}

describe("POST /api/agent 会话级并发互斥", () => {
  beforeEach(() => {
    process.env.AGENT_ENABLED = "1";
    mocks.isAgentEnabled.mockReturnValue(true);
    mocks.createAgentContext.mockReturnValue({
      budget: { maxIterations: 32, currentIteration: 0, maxToolCalls: 64, toolCallCount: 0 },
    });
    mocks.createAgentTools.mockReturnValue([]);
    mocks.runAgentLoop.mockImplementation(async function* () {});
    mocks.reclaimStaleRunningSessions.mockResolvedValue(0);
    mocks.interruptRunningSession.mockResolvedValue(true);
    mocks.snapshotToInitialState.mockReturnValue({});
  });

  afterEach(() => {
    delete process.env.AGENT_ENABLED;
    vi.clearAllMocks();
  });

  it("resume：会话仍 running（并发请求/僵尸未回收）时原子抢占失败 → 409", async () => {
    mocks.getAgentSessionForUser.mockResolvedValue(snapSession("running"));
    mocks.tryAcquireAgentSession.mockResolvedValue("conflict");

    const res = await POST(makeReq("u1", { resume: true, sessionId: "s1" }));

    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("仍在执行中");
    expect(mocks.tryAcquireAgentSession).toHaveBeenCalledWith("s1", "u1");
    // 未开始跑图
    expect(mocks.runAgentLoop).not.toHaveBeenCalled();
  });

  it("resume：interrupted 会话抢占成功 → 进入续跑（不 409）", async () => {
    mocks.getAgentSessionForUser.mockResolvedValue(snapSession("interrupted"));
    mocks.tryAcquireAgentSession.mockResolvedValue("acquired");

    const res = await POST(makeReq("u1", { resume: true, sessionId: "s1" }));

    expect(res.status).toBe(200);
    expect(mocks.tryAcquireAgentSession).toHaveBeenCalledWith("s1", "u1");
    // 消费 SSE 流触发 start 回调，确认抢占成功后确实开始跑图
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(mocks.runAgentLoop).toHaveBeenCalled();
  });

  it("跟聊：completed 会话抢占冲突（并发已开始）→ 409", async () => {
    mocks.getAgentSessionForUser.mockResolvedValue(snapSession("completed"));
    mocks.tryAcquireAgentSession.mockResolvedValue("conflict");

    const res = await POST(makeReq("u1", { goal: "新目标", sessionId: "s1" }));

    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("仍在执行中");
    // 跟聊抢占应带 goal 与 fromStatuses
    expect(mocks.tryAcquireAgentSession).toHaveBeenCalledWith("s1", "u1", {
      goal: "新目标",
      fromStatuses: ["completed", "interrupted", "error"],
    });
    expect(mocks.runAgentLoop).not.toHaveBeenCalled();
  });

  it("跟聊：running 且本端已断时先回收再抢占", async () => {
    mocks.getAgentSessionForUser
      .mockResolvedValueOnce(snapSession("running"))
      .mockResolvedValueOnce(snapSession("interrupted"));
    mocks.tryAcquireAgentSession.mockResolvedValue("acquired");

    const res = await POST(makeReq("u1", { goal: "写综述正文", sessionId: "s1" }));

    expect(res.status).toBe(200);
    expect(mocks.interruptRunningSession).toHaveBeenCalledWith("s1", "u1");
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(mocks.runAgentLoop).toHaveBeenCalled();
  });
});
