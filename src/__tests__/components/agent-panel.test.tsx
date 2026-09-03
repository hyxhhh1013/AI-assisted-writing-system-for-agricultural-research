// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { WriteStatus } from "@/lib/agent/write-status";

/** 受控 mock：AgentPanel 通过 useAgent() 拿到这个对象，测试逐例改写 */
let mockAgent: Record<string, unknown>;

vi.mock("@/hooks/use-agent", () => ({
  useAgent: () => mockAgent,
}));

vi.mock("@/services/project", () => ({
  getProject: vi.fn().mockResolvedValue(null),
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
    orphanedRunning: null,
    abandonOrphanedSession: vi.fn(),
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

  it("写节已完成后仍显示思考指示器", () => {
    mockAgent = makeAgent({
      isRunning: true,
      status: "thinking",
      writeStatus: {
        ...writeStatus,
        stage: "completed",
        done: { chars: 1200, issueCount: 0, passed: true },
      },
      messages: [
        { kind: "user", text: "写引言" },
        { kind: "action", tool: "write_section", params: { section: "引言" } },
        { kind: "observation", tool: "write_section", summary: "已写回" },
      ],
    });
    render(<AgentPanel />);
    expect(screen.getByText("思考中")).toBeTruthy();
    expect(screen.getByText("正在思考下一步…")).toBeTruthy();
  });
});

describe("AgentPanel × 导入确认卡", () => {
  beforeEach(() => {
    mockAgent = makeAgent();
  });

  it("点开候选项后显示摘要，勾选不受展开影响", () => {
    mockAgent = makeAgent({
      isRunning: false,
      status: "completed",
      messages: [],
      pendingConfirm: {
        tool: "import_reference",
        message: "确认批量导入 1 篇文献到项目参考文献？",
        params: {
          importItems: [
            {
              id: "doi:10.1/x",
              title: "Catalytic pyrolysis review",
              authors: ["Zhang"],
              year: 2024,
              journal: "JAAP",
              doi: "10.1/x",
              abstract: "This paper reviews biomass catalytic pyrolysis.",
              source: "openalex",
              isOpenAccess: true,
              openAccessUrl: "https://oa.example/paper.pdf",
            },
          ],
        },
      },
    });
    render(<AgentPanel />);
    expect(screen.getByText("Catalytic pyrolysis review")).toBeTruthy();
    expect(screen.getByRole("button", { name: /确认导入 1 篇/ })).toBeTruthy();
    expect(screen.queryByText(/This paper reviews/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Catalytic pyrolysis review/ }));
    expect(screen.getByText(/This paper reviews biomass catalytic pyrolysis/)).toBeTruthy();
    expect(screen.getByText("打开 OA 全文")).toBeTruthy();
  });
});

describe("AgentPanel × 继续推进条", () => {
  it("空闲且有对话时显示下一步，而不是发送旁的灰色按钮", () => {
    mockAgent = makeAgent({
      isRunning: false,
      status: "completed",
      messages: [
        { kind: "user", text: "开始吧" },
        { kind: "thought", text: "撰写引言章节，对齐蓝图要点：" },
        {
          kind: "summary",
          summary: {
            text: "刚才只是口头说了要「撰写章节」，还没有真正执行。",
            toolCallCount: 0,
            keyFindings: [],
          },
        },
      ],
    });
    render(<AgentPanel projectId="p1" />);
    expect(screen.getByText(/上一轮只宣布了，还没执行/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /继续推进/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^继续$/ })).toBeNull();
  });

  it("点继续推进会发送跟聊目标", () => {
    const sendGoal = vi.fn();
    mockAgent = makeAgent({
      isRunning: false,
      status: "completed",
      sendGoal,
      messages: [
        { kind: "user", text: "开始吧" },
        { kind: "thought", text: "撰写引言章节，对齐蓝图要点：" },
      ],
    });
    render(<AgentPanel projectId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /继续推进/ }));
    expect(sendGoal).toHaveBeenCalledWith("继续", { attachmentIds: [] });
  });

  it("检查点期间不显示续跑条", () => {
    mockAgent = makeAgent({
      isRunning: false,
      status: "awaiting_checkpoint",
      pendingCheckpoint: {
        id: "cp1",
        kind: "outline_approve",
        title: "确认大纲",
        message: "请确认大纲后再写",
      },
      messages: [{ kind: "user", text: "写大纲" }],
    });
    render(<AgentPanel projectId="p1" />);
    expect(screen.queryByRole("button", { name: /继续推进/ })).toBeNull();
  });

  it("检查点期间不把孤儿会话条叠在确认卡上", () => {
    mockAgent = makeAgent({
      isRunning: false,
      status: "awaiting_checkpoint",
      pendingCheckpoint: {
        id: "cp1",
        kind: "outline_approve",
        title: "确认大纲",
        message: "请确认大纲后再写",
      },
      orphanedRunning: { id: "s1", status: "running" },
      messages: [{ kind: "user", text: "写大纲" }],
    });
    render(<AgentPanel projectId="p1" />);
    expect(screen.getByText("一起过目这份大纲")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /强制结束/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /接上进度/ })).toBeNull();
  });

  it("大纲检查点出示人控过目入口", () => {
    mockAgent = makeAgent({
      isRunning: false,
      status: "awaiting_checkpoint",
      pendingCheckpoint: {
        id: "cp1",
        kind: "outline_approve",
        title: "一起确认大纲",
        message: "请确认",
        preview: "## 摘要\n要点\n## 引言\n背景",
      },
      messages: [{ kind: "user", text: "写大纲" }],
    });
    render(<AgentPanel projectId="p1" />);
    expect(screen.getByRole("button", { name: "批准这份大纲，继续" })).toBeTruthy();
    expect(screen.getByText("一起确认大纲")).toBeTruthy();
  });

  it("蓝图检查点出示人控过目入口", () => {
    mockAgent = makeAgent({
      isRunning: false,
      status: "awaiting_checkpoint",
      pendingCheckpoint: {
        id: "cp2",
        kind: "blueprint_approve",
        title: "一起确认写作蓝图",
        message: "请确认",
        preview: "# 主张\n各节要点\n### 引言\n提出问题",
      },
      messages: [{ kind: "user", text: "写蓝图" }],
    });
    render(<AgentPanel projectId="p1" onOpenBlueprint={() => undefined} />);
    expect(screen.getByRole("button", { name: "批准这份蓝图，继续" })).toBeTruthy();
    expect(screen.getByText("一起确认写作蓝图")).toBeTruthy();
  });

  it("澄清检查点把问题做成可读问答卡", () => {
    mockAgent = makeAgent({
      isRunning: false,
      status: "awaiting_checkpoint",
      pendingCheckpoint: {
        id: "cp3",
        kind: "clarify",
        title: "需要你补充一点信息",
        message: "先写引言还是先检索？",
      },
      messages: [{ kind: "user", text: "开始吧" }],
    });
    render(<AgentPanel projectId="p1" />);
    expect(screen.getByText("先写引言还是先检索？")).toBeTruthy();
    expect(screen.getByRole("button", { name: "回答后继续" })).toBeTruthy();
  });
});
