import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getAgentProjectSnapshot,
  markAgentProjectDirty,
  refreshAgentProjectContext,
} from "@/lib/agent/project-refresh";
import { loadAgentProject } from "@/lib/agent/project-loader";
import { buildRecentAgentMemoryBlock } from "@/lib/agent/session-memory";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import type { AgentContext } from "@/lib/agent/types";

vi.mock("@/lib/agent/project-loader", () => ({
  loadAgentProject: vi.fn(),
}));
vi.mock("@/lib/agent/session-memory", () => ({
  buildRecentAgentMemoryBlock: vi.fn().mockResolvedValue(""),
  appendMemoryToBriefing: vi.fn((briefing: string, block: string) => briefing + "\n\n" + block),
}));

const sample: AgentProjectSnapshot = {
  title: "T",
  mode: "review",
  language: "zh",
  template: "sci",
  citationStyle: "gbt7714",
  researchDirection: "",
  outline: "",
  references: [],
  dataClaims: [],
  currentPhase: null,
  hasWritingBlueprint: false,
  hasArgumentBlueprint: false,
  sectionFills: [],
  hasPaperConfig: false,
};

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    userId: "u1",
    projectId: "p1",
    signal: new AbortController().signal,
    budget: { maxIterations: 32, currentIteration: 0, maxToolCalls: 64, toolCallCount: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(loadAgentProject).mockReset();
  vi.mocked(buildRecentAgentMemoryBlock).mockClear();
  vi.mocked(buildRecentAgentMemoryBlock).mockResolvedValue("");
});

describe("getAgentProjectSnapshot", () => {
  it("首次加载后缓存到 ctx，二次调用不再查库", async () => {
    const c = makeCtx();
    vi.mocked(loadAgentProject).mockResolvedValue(sample);
    const a = await getAgentProjectSnapshot(c);
    const b = await getAgentProjectSnapshot(c);
    expect(a).toBe(sample);
    expect(b).toBe(sample);
    expect(loadAgentProject).toHaveBeenCalledTimes(1);
  });

  it("无 projectId 时返回 null 且不查库", async () => {
    const c = makeCtx({ projectId: undefined });
    expect(await getAgentProjectSnapshot(c)).toBeNull();
    expect(loadAgentProject).not.toHaveBeenCalled();
  });

  it("getAgentProjectSnapshot 在 dirty 时强制重载", async () => {
    const c = makeCtx({ projectSnapshot: sample, projectDirty: true });
    vi.mocked(loadAgentProject).mockResolvedValue(sample);
    await getAgentProjectSnapshot(c);
    expect(loadAgentProject).toHaveBeenCalledTimes(1);
    expect(c.projectDirty).not.toBe(true);
  });
});

describe("refreshAgentProjectContext", () => {
  it("快照已最新且未标脏时不查库（复用）", async () => {
    const c = makeCtx({ projectSnapshot: sample });
    await refreshAgentProjectContext(c);
    expect(loadAgentProject).not.toHaveBeenCalled();
  });

  it("无快照时加载并生成简报，置 projectBriefing", async () => {
    const c = makeCtx();
    vi.mocked(loadAgentProject).mockResolvedValue(sample);
    await refreshAgentProjectContext(c);
    expect(loadAgentProject).toHaveBeenCalledTimes(1);
    expect(c.projectSnapshot).toBe(sample);
    expect(c.projectBriefing).toBeTruthy();
    // 注：计划原断言为 toContain("生物炭综述")，但本测试 sample 的 title 是 "T"
    // （"生物炭综述" 仅出现在 agent-project-briefing.test.ts 的独立 sample），
    // 故 formatAgentProjectBriefing(sample) 输出「标题：T」，此处按计划备注适配。
    expect(c.projectBriefing).toContain("标题：T");
  });

  it("跨会话记忆与工作记忆拼入简报", async () => {
    const c = makeCtx({
      workMemory: { thesis: "我的论点", decisions: [], todos: [], updatedAt: 0 },
    });
    vi.mocked(loadAgentProject).mockResolvedValue(sample);
    vi.mocked(buildRecentAgentMemoryBlock).mockResolvedValue("【记忆块】");
    await refreshAgentProjectContext(c);
    expect(c.projectBriefing).toContain("【记忆块】");
    expect(c.projectBriefing).toContain("我的论点");
  });

  it("withMemory:false 时不查询跨会话记忆", async () => {
    const c = makeCtx();
    vi.mocked(loadAgentProject).mockResolvedValue(sample);
    await refreshAgentProjectContext(c, { withMemory: false });
    expect(buildRecentAgentMemoryBlock).not.toHaveBeenCalled();
  });

  it("标脏后强制重载（写工具落地场景）", async () => {
    const c = makeCtx();
    vi.mocked(loadAgentProject).mockResolvedValue(sample);
    await refreshAgentProjectContext(c);
    expect(loadAgentProject).toHaveBeenCalledTimes(1);
    markAgentProjectDirty(c);
    await refreshAgentProjectContext(c);
    expect(loadAgentProject).toHaveBeenCalledTimes(2);
    expect(c.projectDirty).not.toBe(true);
  });

  it("loadAgentProject 抛错时不阻断（保留旧状态，供下次重试）", async () => {
    const c = makeCtx({ projectSnapshot: sample, projectDirty: true });
    vi.mocked(loadAgentProject).mockRejectedValue(new Error("db down"));
    await expect(refreshAgentProjectContext(c)).resolves.toBeUndefined();
    expect(c.projectSnapshot).toBe(sample);
    expect(c.projectDirty).toBe(true);
  });
});
