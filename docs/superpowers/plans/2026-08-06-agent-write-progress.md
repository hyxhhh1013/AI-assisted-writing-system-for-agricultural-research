# Agent write_section 进度透传 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent 调用 `write_section`（fast/full 双模式）期间，把写作管道内部的阶段进度（生成初稿/核查/修正 + 实时字数）经 agent SSE 通道实时推给前端，替代静态的「正在撰写「引言」…」。

**Architecture:** 写作管道已发射 `status`/`pipeline_step`/`delta` 等进度事件，但被 `writing-runner.ts` 收进本地数组丢弃。方案：`AgentContext` 增加 `emitLiveEvent` 实时通道（接到 `runAgentGraphLoop` 已有的 `LiveEventQueue`）；新增纯函数翻译层 `writing-progress.ts` 把管道事件翻译成新事件 `agent/progress { label }`；`write-section.ts` 接线；前端用 `progressLabel` 覆盖工作指示器文案。进度 live-only、不持久化。

**Tech Stack:** Next.js 16、LangGraph、Vitest、SSE。

**前置阅读：**
- 设计文档：`docs/superpowers/specs/2026-08-06-agent-write-progress-design.md`
- `src/lib/agent/writing-runner.ts`（`runAgentWriteSection` 的 `emit` 闭包）
- `src/lib/agent/langgraph/run-graph.ts`（`LiveEventQueue` 位置）
- `src/hooks/use-agent.ts`（`handleEvent` + `isRunning`）
- `src/components/shared/agent/agent-panel.tsx`（工作指示器渲染点）

**验证命令（各任务通用）：**
```bash
cd "/d/project/论文助手"
npx tsc --noEmit          # 类型检查
npx vitest run <文件>     # 单测
```
注意：husky pre-commit 钩子（typecheck + lint-staged）偶尔超时，超时后用 `git commit --timeout 300000` 重试即可成功；超时中断会留下 `stash@{N}: lint-staged automatic backup`，可 `git stash drop`（需用户确认）。

---

### Task 1: 事件契约 + AgentContext 实时通道字段

**Files:**
- Modify: `src/contracts/agent.ts`（`AgentSSEEvent` 联合类型）
- Modify: `src/lib/agent/types.ts`（`AgentContext`）
- Test: 无独立测试（类型层，靠 tsc 验证）

- [ ] **Step 1: `contracts/agent.ts` 新增事件类型**

在 `AgentSSEEvent` 联合类型里、`agent/thought_delta` 分支后加入：

```ts
  /** 写节等长工具执行期间的实时进度文案（服务端拼好，含章节名；live-only 不持久化） */
  | { type: "agent/progress"; label: string }
```

- [ ] **Step 2: `types.ts` 给 `AgentContext` 加通道字段**

在 `AgentContext` 接口的 `budget` 字段前（`workMemory` 之后）加入：

```ts
  /** 工具执行期间可选的实时事件通道（write_section 进度透传用；未接图循环时缺省为 undefined） */
  emitLiveEvent?: (event: AgentSSEEvent) => void;
```

`AgentSSEEvent` 已在 `types.ts` 顶部 import（`import type { ..., AgentSSEEvent, ... } from "@/contracts/agent"`）。

- [ ] **Step 3: 验证**

```bash
npx tsc --noEmit
npx vitest run src/__tests__/lib/agent-parallel-reads.test.ts src/__tests__/lib/agent-ui-progress.test.ts
```
Expected: tsc 无错误，两个测试文件 PASS（`makeCtx()` 里构造的 `AgentContext` 对象字面量不受可选字段影响）。

- [ ] **Step 4: Commit**

```bash
git add src/contracts/agent.ts src/lib/agent/types.ts
git commit -m "feat(agent): agent/progress 事件类型 + AgentContext.emitLiveEvent 通道"
```

---

### Task 2: run-graph.ts 实时通道提前接入

**Files:**
- Modify: `src/lib/agent/langgraph/run-graph.ts`
- Test: 无独立测试（图循环整合，靠既有测试回归）

- [ ] **Step 1: 把 LiveEventQueue 创建提前到 runtime 定义处**

当前 `runtime` 定义在约 96-101 行：

```ts
  const runtime: AgentGraphRuntime = {
    agentContext: context,
    tools,
    repeatTracker,
    antispamTracker,
  };
```

在 `runtime` 定义之后（`uiTranscript` 声明之前）追加：

```ts
  /** 实时 SSE 事件队列：agentNode LLM 流式 delta 与 graph 快照流合并用 */
  const liveQueue = new LiveEventQueue();
  runtime.emitLiveEvent = (e) => liveQueue.push(e);
  context.emitLiveEvent = runtime.emitLiveEvent;
```

- [ ] **Step 2: 删除原位置的创建与赋值**

删除 `graph.stream(...)` 之后的两行（原约 433-434 行）：

```ts
    // 真流式：agentNode LLM 逐 token 走实时通道，graph 快照事件照常
    const liveQueue = new LiveEventQueue();
    runtime.emitLiveEvent = (e) => liveQueue.push(e);
```

注意：`mergeGraphAndLive(stream, liveQueue)` 调用处（原 436 行）**不要动**，它继续引用提前创建的同一 `liveQueue`。

- [ ] **Step 3: 验证**

```bash
npx tsc --noEmit
npx vitest run src/__tests__/lib/agent-parallel-reads.test.ts src/__tests__/api/agent-concurrency-route.test.ts src/__tests__/lib/agent-ui-progress.test.ts
```
Expected: 全部 PASS。`LiveEventQueue` 是文件底部模块级 class，运行期访问不受 TDZ 影响。

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/langgraph/run-graph.ts
git commit -m "perf(agent): 实时事件队列提前到 runtime 初始化，工具可经 ctx.emitLiveEvent 推送"
```

---

### Task 3: 翻译层 writing-progress.ts（TDD）

**Files:**
- Create: `src/lib/agent/writing-progress.ts`
- Test: `src/__tests__/lib/agent-writing-progress.test.ts`

- [ ] **Step 1: 写失败测试**

`src/__tests__/lib/agent-writing-progress.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import {
  createWriteProgressState,
  translateWritingEventToProgress,
} from "@/lib/agent/writing-progress";

describe("translateWritingEventToProgress", () => {
  it("maps status writing → 生成初稿 label（含章节中文名）", () => {
    expect(
      translateWritingEventToProgress("introduction", { type: "status", status: "writing" }, createWriteProgressState()),
    ).toEqual({ label: "正在撰写「引言」· 生成初稿…" });
  });

  it("maps status verifying → 自动核查中", () => {
    expect(
      translateWritingEventToProgress("methods", { type: "status", status: "verifying" }, createWriteProgressState()),
    ).toEqual({ label: "正在撰写「方法」· 自动核查中…" });
  });

  it("maps status refining → 修正中", () => {
    expect(
      translateWritingEventToProgress("results", { type: "status", status: "refining" }, createWriteProgressState()),
    ).toEqual({ label: "正在撰写「结果」· 修正中…" });
  });

  it("returns null for non-forwarded statuses (completed / retrieving)", () => {
    expect(translateWritingEventToProgress("x", { type: "status", status: "completed" }, createWriteProgressState())).toBeNull();
    expect(translateWritingEventToProgress("x", { type: "status", status: "retrieving" }, createWriteProgressState())).toBeNull();
  });

  it("passes through pipeline_step detail 透传", () => {
    expect(
      translateWritingEventToProgress("introduction", { type: "pipeline_step", step: "writing", status: "done", detail: "初稿 2400 字" }, createWriteProgressState()),
    ).toEqual({ label: "正在撰写「引言」· 初稿 2400 字" });
  });

  it("returns null for pipeline_step without detail", () => {
    expect(
      translateWritingEventToProgress("x", { type: "pipeline_step", step: "writing", status: "running" }, createWriteProgressState()),
    ).toBeNull();
  });

  it("maps bullet_done → 要点进度", () => {
    expect(
      translateWritingEventToProgress("introduction", { type: "bullet_done", bulletIndex: 1, content: "x", bulletCount: 3 }, createWriteProgressState()),
    ).toEqual({ label: "正在撰写「引言」· 要点 2/3 完成" });
  });

  it("delta 累计字数，按节流间隔发射", () => {
    const state = createWriteProgressState();
    // now=1000：首次 delta 立即发射
    const first = translateWritingEventToProgress("introduction", { type: "delta", content: "abc" }, state, 1000);
    expect(first).toEqual({ label: "正在撰写「引言」· 生成初稿… 已 3 字" });
    // now=1500（间隔 < 1000ms）：节流，不发射，但字数继续累计
    const throttled = translateWritingEventToProgress("introduction", { type: "delta", content: "defgh" }, state, 1500);
    expect(throttled).toBeNull();
    // now=2100（间隔 ≥ 1000ms）：发射累计字数 8
    const third = translateWritingEventToProgress("introduction", { type: "delta", content: "ijk" }, state, 2100);
    expect(third).toEqual({ label: "正在撰写「引言」· 生成初稿… 已 8 字" });
  });

  it("returns null for non-forwarded events (references / verification / error)", () => {
    expect(translateWritingEventToProgress("x", { type: "references", references: [] }, createWriteProgressState())).toBeNull();
    expect(translateWritingEventToProgress("x", { type: "verification", verification: "ok" }, createWriteProgressState())).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/__tests__/lib/agent-writing-progress.test.ts
```
Expected: FAIL，报 `Cannot find module '@/lib/agent/writing-progress'`。

- [ ] **Step 3: 实现翻译层**

`src/lib/agent/writing-progress.ts`：

```ts
import type { WritingSSEEvent } from "@/contracts/sse";
import { sectionDisplayName } from "@/lib/agent/ui-progress";

/** delta 实时字数推送的最小间隔 */
export const DELTA_THROTTLE_MS = 1000;

export interface WriteProgressState {
  /** 已累计的 delta 原始字符数（节流期内继续累计） */
  chars: number;
  /** 上次 delta 发射时间戳 */
  lastDeltaEmitAt: number;
}

export function createWriteProgressState(): WriteProgressState {
  return { chars: 0, lastDeltaEmitAt: 0 };
}

/**
 * 把写作管道事件翻译成 agent/progress 的展示 label。
 * 返回 null 表示不转发（非进度事件 / 节流中）。now 参数默认取 Date.now()，测试可注入。
 */
export function translateWritingEventToProgress(
  section: string,
  event: WritingSSEEvent,
  state: WriteProgressState,
  now: number = Date.now(),
): { label: string } | null {
  const base = `正在撰写「${sectionDisplayName(section)}」`;

  switch (event.type) {
    case "status": {
      switch (event.status) {
        case "writing":
          return { label: `${base}· 生成初稿…` };
        case "verifying":
          return { label: `${base}· 自动核查中…` };
        case "refining":
          return { label: `${base}· 修正中…` };
        default:
          return null;
      }
    }
    case "pipeline_step": {
      if (!event.detail) return null;
      return { label: `${base}· ${event.detail}` };
    }
    case "bullet_done": {
      return { label: `${base}· 要点 ${event.bulletIndex + 1}/${event.bulletCount} 完成` };
    }
    case "delta": {
      state.chars += event.content.length;
      if (now - state.lastDeltaEmitAt < DELTA_THROTTLE_MS) return null;
      state.lastDeltaEmitAt = now;
      return { label: `${base}· 生成初稿… 已 ${state.chars} 字` };
    }
    default:
      return null;
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/__tests__/lib/agent-writing-progress.test.ts
```
Expected: 9 个用例全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/writing-progress.ts src/__tests__/lib/agent-writing-progress.test.ts
git commit -m "feat(agent): write_section 进度翻译层（管道事件 → agent/progress label）"
```

---

### Task 4: writing-runner.ts 转发 onWritingEvent

**Files:**
- Modify: `src/lib/agent/writing-runner.ts`
- Test: `src/__tests__/lib/agent-writing-runner-progress.test.ts`

- [ ] **Step 1: 写失败测试**

`src/__tests__/lib/agent-writing-runner-progress.test.ts`：

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/api/writing/run-pipeline", () => ({
  runWritingPipeline: vi.fn(async ({ emit }: { emit: (e: { type: string }) => void }) => {
    emit({ type: "status", status: "writing" });
    emit({ type: "delta", content: "x".repeat(10) });
    emit({ type: "pipeline_step", step: "writing", status: "done", detail: "初稿 10 字" });
  }),
}));

import { runWritingPipeline } from "@/app/api/writing/run-pipeline";
import { runAgentWriteSection } from "@/lib/agent/writing-runner";

describe("runAgentWriteSection 进度转发", () => {
  it("把管道 emit 的事件实时转发给 onWritingEvent", async () => {
    const received: unknown[] = [];
    await runAgentWriteSection({
      data: {
        title: "t",
        section: "introduction",
        context: "c",
        language: "zh",
        template: "scientific",
        existingReferences: [],
        referenceEvidence: [],
        globalContext: {},
        mode: "full",
        retrievalMode: "balanced",
        researchDirection: "d",
        projectMode: "research",
        citationStyle: "gbt7714",
        dataClaims: [],
      } as never,
      context: "c",
      dataClaims: [],
      userId: "u1",
      signal: new AbortController().signal,
      onWritingEvent: (e) => received.push(e),
    });

    expect(vi.mocked(runWritingPipeline)).toHaveBeenCalled();
    expect(received.map((e) => (e as { type: string }).type)).toEqual([
      "status",
      "delta",
      "pipeline_step",
    ]);
  });

  it("onWritingEvent 缺省时正常收集结果", async () => {
    const result = await runAgentWriteSection({
      data: {
        title: "t",
        section: "introduction",
        context: "c",
        language: "zh",
        template: "scientific",
        existingReferences: [],
        referenceEvidence: [],
        globalContext: {},
        mode: "full",
        retrievalMode: "balanced",
        researchDirection: "d",
        projectMode: "research",
        citationStyle: "gbt7714",
        dataClaims: [],
      } as never,
      context: "c",
      dataClaims: [],
      userId: "u1",
      signal: new AbortController().signal,
    });
    expect(result.pipelineMode).toBe("full");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/__tests__/lib/agent-writing-runner-progress.test.ts
```
Expected: FAIL（第二个用例 OK，第一个用例 `received` 为空——当前 `emit` 未调用 `onWritingEvent`）。

- [ ] **Step 3: 接口加可选参数**

`AgentWriteSectionInput` 接口（约 91-98 行）末尾加：

```ts
  /** 管道内部进度事件实时转发（write_section 进度透传） */
  onWritingEvent?: (event: WritingSSEEvent) => void;
```

（`WritingSSEEvent` 已 import：`import type { WritingSSEEvent } from "@/contracts/sse"`。）

- [ ] **Step 4: emit 闭包转发**

`runAgentWriteSection` 内的 `emit`（现约 175-180 行）：

```ts
  const events: WritingSSEEvent[] = [];
  const emit = (event: WritingSSEEvent) => {
    events.push(event);
    if (event.type === "error") {
      throw new Error(event.error);
    }
  };
```

改为：

```ts
  const events: WritingSSEEvent[] = [];
  const emit = (event: WritingSSEEvent) => {
    events.push(event);
    input.onWritingEvent?.(event);
    if (event.type === "error") {
      throw new Error(event.error);
    }
  };
```

- [ ] **Step 5: 运行测试确认通过**

```bash
npx vitest run src/__tests__/lib/agent-writing-runner-progress.test.ts
```
Expected: 2 个用例 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/writing-runner.ts src/__tests__/lib/agent-writing-runner-progress.test.ts
git commit -m "feat(agent): runAgentWriteSection 转发管道进度事件到 onWritingEvent"
```

---

### Task 5: write-section.ts 接线 + 工具测试

**Files:**
- Modify: `src/lib/agent/tools/write-section.ts`
- Test: `src/__tests__/lib/agent-write-section-progress.test.ts`

- [ ] **Step 1: 写失败测试**

`src/__tests__/lib/agent-write-section-progress.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent/writing-runner", () => ({
  runAgentWriteSection: vi.fn(),
}));
vi.mock("@/lib/agent/project-refresh", () => ({
  getAgentProjectSnapshot: vi.fn(),
}));
vi.mock("@/lib/agent/project-persist", () => ({
  persistAgentDraft: vi.fn(),
}));
vi.mock("@/lib/ai", () => ({
  getAgentModelConfig: vi.fn(() => ({ keyError: null, provider: "zhipu" })),
}));

import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import { getAgentProjectSnapshot } from "@/lib/agent/project-refresh";
import { persistAgentDraft } from "@/lib/agent/project-persist";
import { runAgentWriteSection } from "@/lib/agent/writing-runner";
import { writeSectionTool } from "@/lib/agent/tools/write-section";
import type { AgentContext } from "@/lib/agent/types";

const mockedRun = vi.mocked(runAgentWriteSection);
const mockedSnapshot = vi.mocked(getAgentProjectSnapshot);
const mockedPersist = vi.mocked(persistAgentDraft);

const snapshot = {
  title: "测试论文",
  mode: "research",
  language: "zh",
  template: "scientific",
  citationStyle: "gbt7714",
  researchDirection: "方向",
  outline: "1. 引言\n2. 方法",
  references: [],
  referenceEvidence: [],
  dataClaims: [],
  globalContext: {},
  currentPhase: 1,
  hasWritingBlueprint: false,
  hasArgumentBlueprint: false,
  sectionFills: [],
  hasPaperConfig: false,
} as unknown as AgentProjectSnapshot;

function makeCtx(): AgentContext {
  return {
    userId: "u1",
    projectId: "p1",
    signal: new AbortController().signal,
    budget: { maxIterations: 32, currentIteration: 0, maxToolCalls: 64, toolCallCount: 0 },
    emitLiveEvent: vi.fn(),
  };
}

describe("writeSectionTool 进度透传", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSnapshot.mockResolvedValue(snapshot);
    mockedPersist.mockResolvedValue({ sectionKey: "introduction", referencesAdded: 0 });
    mockedRun.mockImplementation(async ({ onWritingEvent }) => {
      onWritingEvent?.({ type: "status", status: "writing" });
      onWritingEvent?.({ type: "delta", content: "x".repeat(500) });
      onWritingEvent?.({ type: "status", status: "verifying" });
      return {
        draft: "正文草稿",
        references: [],
        verification: undefined,
        issueCount: 0,
        citationWarnings: 0,
        pipelineMode: "full",
      };
    });
  });

  it("把管道事件翻译成 agent/progress 推给 ctx.emitLiveEvent", async () => {
    const ctx = makeCtx();
    const result = await writeSectionTool.execute(
      { section: "introduction", context: "扩写引言", pipelineMode: "full" },
      ctx,
    );
    expect(result.success).toBe(true);

    const emitter = vi.mocked(ctx.emitLiveEvent!);
    expect(emitter).toHaveBeenCalled();
    const calls = emitter.mock.calls.map(([e]) => e);
    expect(calls.some((e) => e.type === "agent/progress")).toBe(true);
    const labels = calls
      .filter((e) => e.type === "agent/progress")
      .map((e) => (e as { label: string }).label);
    expect(labels[0]).toContain("生成初稿");
    expect(labels[0]).toContain("引言");
  });

  it("ctx.emitLiveEvent 缺省时行为与现状一致（不抛错）", async () => {
    const ctx = makeCtx();
    delete ctx.emitLiveEvent;
    const result = await writeSectionTool.execute(
      { section: "introduction", context: "扩写引言", pipelineMode: "fast" },
      ctx,
    );
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/__tests__/lib/agent-write-section-progress.test.ts
```
Expected: FAIL（首个用例断言 `agent/progress` 未收到——当前工具未接线）。

- [ ] **Step 3: 接线**

`src/lib/agent/tools/write-section.ts`：

顶部 import 增加：

```ts
import {
  createWriteProgressState,
  translateWritingEventToProgress,
} from "@/lib/agent/writing-progress";
```

在 `const data: WritingInput = {...};` 块之后、`try {` 之前，构造进度状态：

```ts
    const progressState = createWriteProgressState();
```

`runAgentWriteSection` 调用参数加 `onWritingEvent`：

```ts
      const result = await runAgentWriteSection({
        data,
        context: draftContext,
        dataClaims: project.dataClaims,
        globalContext,
        userId: ctx.userId,
        signal: ctx.signal,
        autoFix,
        onWritingEvent: (event) => {
          const progress = translateWritingEventToProgress(sectionRaw, event, progressState);
          if (progress) {
            ctx.emitLiveEvent?.({ type: "agent/progress", label: progress.label });
          }
        },
      });
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/__tests__/lib/agent-write-section-progress.test.ts
```
Expected: 2 个用例 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools/write-section.ts src/__tests__/lib/agent-write-section-progress.test.ts
git commit -m "feat(agent): write_section 工具接线进度透传（ctx.emitLiveEvent）"
```

---

### Task 6: 前端消费（use-agent + agent-panel）

**Files:**
- Modify: `src/hooks/use-agent.ts`
- Modify: `src/components/shared/agent/agent-panel.tsx`
- Test: 无独立前端测试（手动验证；既有组件测试保持回归）

- [ ] **Step 1: use-agent.ts 加 progressLabel 状态**

在 `streamingText` state（约 49 行）后加：

```ts
  /** 长工具（write_section）执行期间的实时进度文案 */
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
```

- [ ] **Step 2: use-agent.ts handleEvent 加分支**

`handleEvent` 的 switch 里，`agent/action` 分支（现约 211-216 行）开头加清空（新工具开始，旧的进度作废）：

```ts
      case "agent/action":
        setProgressLabel(null);
        setMessages((prev) => [
          ...prev,
          { kind: "action", tool: event.tool, params: event.params },
        ]);
        break;
```

新增 `agent/progress` 分支（放在 `agent/action` 分支后）：

```ts
      case "agent/progress":
        setProgressLabel(event.label);
        break;
```

终态清空：`agent/complete`（约 270 行）与 `agent/error`（约 278 行）分支各加一行 `setProgressLabel(null);`。

- [ ] **Step 3: use-agent.ts cancel / reset 清空**

`cancel` 回调（约 169-175 行）与 `reset` 回调（约 134-146 行）里加 `setProgressLabel(null);`。

- [ ] **Step 4: use-agent.ts 返回值**

`return` 对象（约 438 行起）加 `progressLabel,`。

- [ ] **Step 5: agent-panel.tsx 渲染优先进度文案**

在 `liveProgress` 的 useMemo（约 345-353 行）后加：

```ts
  /** 有实时进度文案（写节进度）时优先展示，否则回退静态工作指示 */
  const displayProgress = agent.progressLabel ?? liveProgress;
```

渲染处（约 761-765 行）：

```tsx
          {displayProgress ? (
            <MessageEnter animate>
              <AgentWorkingIndicator label={displayProgress} />
            </MessageEnter>
          ) : null}
```

- [ ] **Step 6: 验证**

```bash
npx tsc --noEmit
npx vitest run src/__tests__/lib/agent-ui-progress.test.ts
```
Expected: 全 PASS。前端手动验证见 Task 7。

- [ ] **Step 7: Commit**

```bash
git add src/hooks/use-agent.ts src/components/shared/agent/agent-panel.tsx
git commit -m "feat(agent): 前端展示 write_section 实时进度文案"
```

---

### Task 7: 全量回归 + 手动验证

**Files:** 无代码改动

- [ ] **Step 1: 全量测试**

```bash
npx vitest run
```
Expected: 既有基线（约 819 通过 / 4 跳过）上，新增测试全部通过，无回归。

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```
Expected: 无错误。

- [ ] **Step 3: 手动验证（本地 dev 或生产域名 ai4science.hyxhhh.site）**

1. 打开 Agent 面板，发一条带写节的目标（如「把引言扩写到 2000 字」）
2. Agent 调用 `write_section` 期间，观察底部工作指示器从「正在撰写「引言」…」变为「正在撰写「引言」· 生成初稿… 已 N 字」，随后「· 自动核查中…」「· 修正中…」（full 模式）
3. 写节完成后进度文案消失，恢复常规回复
4. 中途点「停止」，进度停止、状态进入 cancelled

- [ ] **Step 4: 推送分支**

```bash
git push origin eng/wave3-academic-align
```

- [ ] **Step 5: 部署（可选，等本 P1 项确认后统一）**

```bash
gh workflow run deploy.yml --ref eng/wave3-academic-align
gh run watch <id>
```
（apply.sh 自带 VPS 本地 HTTP 健康检查；生产域名 `ai4science.hyxhhh.site`。）
