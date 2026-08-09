// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { WriteStatus } from "@/lib/agent/write-status";

/** 受控 mock：AgentPanel 通过 useAgent() 拿到这个对象，测试逐例改写 */
let mockAgent: Record<string, unknown>;

vi.mock("@/hooks/use-agent", () => ({
  useAgent: () => mockAgent,
}));

vi.mock("@/services/project", () => ({
  getProject: vi.fn(),
  patchPaperPassportConfig: vi.fn(),
}));

// 依赖 mock 之后才能安全引入 AgentPanel（其模块顶部调 isAgentWritePublicEnabled）
import { AgentPanel } from "@/components/shared/agent/agent-panel";

afterEach(cleanup);

const writeStatus: WriteStatus = {
  section: "引言",
  stage: "writing",
  chars: 1200,
  elapsedMs: 45_000,
  info: [],
  warnings: [],
};

const pendingAction = {
  kind: "action",
  tool: "write_section",
  params: { section: "引言" },
};

function makeAgent(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: "executing",
    messages: [pendingAction],
    streamingText: "",
    writeStatus: null,
    plan: null,
    pendingCheckpoint: null,
    pendingConfirm: null,
    lastPersisted: null,
    lastProjectMutation: null,
    sessionId: null,
    interruptedSessions: [],
    historyLoaded: false,
    isRunning: true,
    sendGoal: vi.fn(),
    resumeSession: vi.fn(),
    resolveCheckpoint: vi.fn(),
    resolveConfirm: vi.fn(),
    refreshInterrupted: vi.fn(),
    cancel: vi.fn(),
    reset: vi.fn(),
    startNewChat: vi.fn(),
    ...over,
  };
}

describe("AgentPanel × WritingStatusCard：写进度职责移交", () => {
  beforeEach(() => {
    mockAgent = makeAgent();
  });

  it("写状态卡激活时显示卡片，不渲染 AgentWorkingIndicator", () => {
    mockAgent = makeAgent({ writeStatus });
    render(<AgentPanel />);
    expect(screen.getByText(/撰写「引言」/)).toBeTruthy();
    expect(screen.getByText(/正在生成正文/)).toBeTruthy();
    expect(screen.getByText(/1,200 字/)).toBeTruthy();
    // 通用工作指示器被抑制
    expect(screen.queryByText(/正在撰写「引言」…/)).toBeNull();
  });

  it("写状态卡未激活时回退 AgentWorkingIndicator，不显示卡片", () => {
    mockAgent = makeAgent({ writeStatus: null });
    render(<AgentPanel />);
    expect(screen.getByText(/正在撰写「引言」…/)).toBeTruthy();
    expect(screen.queryByText(/正在生成正文/)).toBeNull();
  });
});
