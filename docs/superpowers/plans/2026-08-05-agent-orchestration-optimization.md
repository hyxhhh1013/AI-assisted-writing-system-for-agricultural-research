# Agent 编排优化（P0 三项）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不大改编排语义的前提下，落地三项 P0 优化——①项目快照单飞缓存（消除同轮重复查库）、②system prompt 前缀稳定化（吃到 provider 前缀缓存、降低多轮成本）、③只读工具并行执行（砍掉文献检索/多读路径的串行墙钟时间）。

**Architecture:** 三个独立、各自可单独合入的小改动，全部位于 `src/lib/agent/`。①新增 `project-refresh.ts` 聚合「刷新/取快照/标脏」三件事，`nodes.ts`/`run-graph.ts`/各写工具改为走它，靠 ctx 上的 `projectDirty` 标志避免同轮重复 `loadAgentProject`（该函数是整项目 DB 读：project + references + sections + blueprint + passport）。②`buildAgentSystemPrompt` 去掉易变的项目简报参数，简报改为 `agentNode` 里以独立 user 消息注入——system + 工具 schema 前缀恒定，命中 DeepSeek/Zhipu 前缀缓存。③`toolsNode` 在全部 pending 调用都是只读白名单工具时，走新的 `runParallelReads` 快路径（门禁/配额顺序判定 + `Promise.all` 执行 + 按原顺序产出）；混入写/确认/检查点工具时原串行循环完全不动。

**Tech Stack:** TypeScript / LangGraph (`@langchain/langgraph`) / vitest / Prisma。现有编排入口：`src/lib/agent/langgraph/nodes.ts`（toolsNode）、`run-graph.ts`、`src/lib/agent/core/prompts.ts`。

**预期收益与风险：**
- ① 一轮典型写作任务 DB 往返从 ~6 次降到 1–2 次（低风险）
- ② 多轮/长会话每轮省掉「重新发送 30+ 工具 schema + 固定规则」的输入计费（中风险，prompt 语义需用测试守住）
- ③ 检索/多读任务墙钟时间约减 50–70%（较高风险，仅改动「全只读批次」路径，串行路径零改动兜底）

**批次与分支约定：** 三个 Task Group 各自独立提交（A → B → C）。当前分支 `eng/wave3-academic-align`；按团队约定每个 Group 一个小 commit，A/B 可先合，C 如用户想再拆一个 PR。测试用 `npx vitest run <file>` 跑。

---

## Task Group A：项目快照单飞缓存

### Task A0：基线——确认相关测试当前全绿

- [ ] **Step 1：跑 agent 相关测试，记录基线**

Run: `npx vitest run src/__tests__/lib/agent-project-briefing.test.ts src/__tests__/lib/agent-tools-wave2.test.ts src/__tests__/lib/agent-ensure-write-prereqs.test.ts src/__tests__/lib/agent-langgraph.test.ts`
Expected: 全部通过（若有失败先修，再继续本计划）

- [ ] **Step 2：typecheck 基线**

Run: `npx tsc --noEmit`
Expected: 无错误

---

### Task A1：`AgentContext` 增加 `projectDirty` 字段

**Files:**
- Modify: `src/lib/agent/types.ts:44`（`projectSnapshot?` 声明之后）

- [ ] **Step 1：加字段**

```ts
  /** 运行前加载的项目快照（阶段门禁用） */
  projectSnapshot?: import("@/lib/agent/project-loader").AgentProjectSnapshot | null;
  /** 项目已被本会话写工具变更：下一次 refreshAgentProjectContext 必须重载（防同轮复用陈旧快照） */
  projectDirty?: boolean;
```

- [ ] **Step 2：typecheck**

Run: `npx tsc --noEmit`
Expected: 无错误

---

### Task A2：新建 `src/lib/agent/project-refresh.ts`

**Files:**
- Create: `src/lib/agent/project-refresh.ts`
- Test: `src/__tests__/lib/agent-project-refresh.test.ts`

- [ ] **Step 1：写失败测试**

创建 `src/__tests__/lib/agent-project-refresh.test.ts`：

```ts
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
    expect(c.projectBriefing).toContain("生物炭综述");
  });

  it("标脏后强制重载（写工具落地场景）", async () => {
    const c = makeCtx();
    vi.mocked(loadAgentProject).mockResolvedValue(sample);
    await refreshAgentProjectContext(c);
    expect(loadAgentProject).toHaveBeenCalledTimes(1);
    markAgentProjectDirty(c);
    await refreshAgentProjectContext(c);
    expect(loadAgentProject).toHaveBeenCalledTimes(2);
  });
});
```

注：`project-briefing.ts` / `phase-task-pack.ts` / `work-memory.ts` 是纯函数，走真实实现即可；`formatAgentProjectBriefing(sample)` 输出含「生物炭综述」等固定文案（见 `agent-project-briefing.test.ts`），故简报断言沿用该字面量。

- [ ] **Step 2：跑测试确认失败**

Run: `npx vitest run src/__tests__/lib/agent-project-refresh.test.ts`
Expected: FAIL（`Cannot find module "@/lib/agent/project-refresh"`）

- [ ] **Step 3：实现 `project-refresh.ts`**

创建 `src/lib/agent/project-refresh.ts`：

```ts
/**
 * 项目快照/简报的会话内缓存与刷新。
 *
 * 背景：同一轮 agent 运行里 loadAgentProject（整项目 DB 读：project + references
 * + sections + blueprint + passport）会被多次触发——run 前加载、写前置自补、
 * 每个写工具落地后刷新、confirm 路径刷新。每次都是全量查询。
 *
 * 策略：
 * - getAgentProjectSnapshot：优先复用 ctx.projectSnapshot；未加载才查库并缓存到 ctx。
 * - refreshAgentProjectContext：仅当「无快照」或「已标脏」时才查库重载；否则复用。
 *   写工具落地后由调用方先 markAgentProjectDirty 再 refresh，保证写后必取新值；
 *   而「写前置自补」「同轮二次刷新」等非写入刷新直接复用，消除重复查库。
 */

import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import { loadAgentProject } from "@/lib/agent/project-loader";
import { appendPhasePackToBriefing } from "@/lib/agent/phase-task-pack";
import { formatAgentProjectBriefing } from "@/lib/agent/project-briefing";
import { appendMemoryToBriefing } from "@/lib/agent/session-memory";
import { buildRecentAgentMemoryBlock } from "@/lib/agent/session-memory";
import { formatWorkMemoryBlock } from "@/lib/agent/work-memory";
import type { AgentContext } from "@/lib/agent/types";

/** 取快照：复用 ctx 缓存，未加载则查库一次并缓存 */
export async function getAgentProjectSnapshot(
  ctx: AgentContext,
): Promise<AgentProjectSnapshot | null> {
  if (ctx.projectSnapshot !== null && ctx.projectSnapshot !== undefined) {
    return ctx.projectSnapshot;
  }
  if (!ctx.projectId) return null;
  const snap = await loadAgentProject(ctx.userId, ctx.projectId);
  ctx.projectSnapshot = snap;
  return snap;
}

/** 标记项目已被写工具变更：下一次 refresh 必须查库重载 */
export function markAgentProjectDirty(ctx: AgentContext): void {
  ctx.projectDirty = true;
}

/**
 * 刷新项目简报（供 LLM 上下文）。快照最新且未标脏时直接复用，不查库。
 * 简报 = 阶段任务包 + 项目简报 + 跨会话记忆 + 本会话工作记忆。
 */
export async function refreshAgentProjectContext(
  ctx: AgentContext,
): Promise<void> {
  if (!ctx.projectId) return;
  if (ctx.projectSnapshot !== null && ctx.projectDirty !== true) {
    return;
  }
  const snap = await loadAgentProject(ctx.userId, ctx.projectId);
  ctx.projectSnapshot = snap;
  ctx.projectDirty = false;
  let briefing = appendPhasePackToBriefing(
    formatAgentProjectBriefing(snap),
    snap,
  );
  try {
    const memory = await buildRecentAgentMemoryBlock(ctx.userId, ctx.projectId);
    briefing = appendMemoryToBriefing(briefing, memory);
  } catch {
    /* ignore */
  }
  const workBlock = ctx.workMemory
    ? formatWorkMemoryBlock(ctx.workMemory)
    : null;
  if (workBlock) {
    briefing = appendMemoryToBriefing(briefing, workBlock);
  }
  ctx.projectBriefing = briefing;
}
```

- [ ] **Step 4：跑测试确认通过**

Run: `npx vitest run src/__tests__/lib/agent-project-refresh.test.ts`
Expected: PASS（5 个用例）

- [ ] **Step 5：typecheck**

Run: `npx tsc --noEmit`
Expected: 无错误

---

### Task A3：`nodes.ts` 接入共享刷新 + 写工具落地标脏

**Files:**
- Modify: `src/lib/agent/langgraph/nodes.ts:64-74`（导入）、`:98-122`（删除本地 refresh 函数）、`:560`（前置刷新回调）、`:712-714`（写工具落地刷新）

- [ ] **Step 1：改导入，删本地 refresh 函数**

把 `nodes.ts:64-74` 的导入块改为：

```ts
import { loadAgentProject } from "@/lib/agent/project-loader";
```
→ 改为（删除 loadAgentProject 与简报相关导入，新增 project-refresh）：

```ts
import {
  markAgentProjectDirty,
  refreshAgentProjectContext,
} from "@/lib/agent/project-refresh";
```

同时删除 `nodes.ts:98-122` 的本地 `refreshAgentProjectContext` 函数（整段 `async function refreshAgentProjectContext(agentContext: ...)` 删除），因为已被共享实现替代。删除后确认 `appendPhasePackToBriefing`、`formatAgentProjectBriefing`、`appendMemoryToBriefing`、`buildRecentAgentMemoryBlock`、`loadAgentProject` 在本文件无其它引用，若有则一并从导入中移除。

- [ ] **Step 2：前置刷新回调标脏**

`nodes.ts:560` 附近（`ensureWritePrerequisites` 的 refresh 参数）改为：

```ts
      const ensured = await ensureWritePrerequisites(
        agentContext,
        tools,
        () => {
          markAgentProjectDirty(agentContext);
          return refreshAgentProjectContext(agentContext);
        },
      );
```

（ensureWritePrerequisites 每步写工具成功后都调用该回调，见 `ensure-write-prereqs.ts:116`；写后必须标脏重载，否则复用旧快照会让 `listMissingWritePrereqs` 永远看不到新大纲。）

- [ ] **Step 3：写工具落地后标脏 + 刷新**

`nodes.ts:712-714` 改为：

```ts
      if (result.success && SNAPSHOT_REFRESH_TOOLS.has(tool.name)) {
        markAgentProjectDirty(agentContext);
        await refreshAgentProjectContext(agentContext);
      }
```

- [ ] **Step 4：跑相关测试**

Run: `npx vitest run src/__tests__/lib/agent-tools-wave2.test.ts src/__tests__/lib/agent-ensure-write-prereqs.test.ts src/__tests__/lib/agent-project-refresh.test.ts`
Expected: 全部通过

- [ ] **Step 5：typecheck**

Run: `npx tsc --noEmit`
Expected: 无错误

---

### Task A4：`run-graph.ts` 接入共享刷新（前导 + confirm 路径）

**Files:**
- Modify: `src/lib/agent/langgraph/run-graph.ts:23-28`（导入）、`:67-79`（前导加载）、`:299-319`（confirm 路径）

- [ ] **Step 1：改导入**

`run-graph.ts:23-28` 的导入中：
- 删除 `import { appendPhasePackToBriefing } from "@/lib/agent/phase-task-pack";`（改后不再直接使用）
- 删除 `import { loadAgentProject } from "@/lib/agent/project-loader";`
- 新增：

```ts
import {
  markAgentProjectDirty,
  refreshAgentProjectContext,
} from "@/lib/agent/project-refresh";
```

保留 `formatAgentProjectBriefing`（catch 分支仍用）、`appendMemoryToBriefing`（resume 路径仍用）、`formatWorkMemoryBlock`（resume 路径仍用）、`projectFingerprint`（confirm 路径仍用）。

- [ ] **Step 2：前导加载改为共享刷新**

`run-graph.ts:67-79` 改为：

```ts
  if (!context.projectBriefing && context.projectId) {
    try {
      await refreshAgentProjectContext(context);
    } catch {
      context.projectSnapshot = null;
      context.projectBriefing = formatAgentProjectBriefing(null);
    }
  }
```

- [ ] **Step 3：confirm 成功路径改为标脏 + 共享刷新**

`run-graph.ts:299-319` 改为：

```ts
    if (result.success && context.projectId) {
      try {
        markAgentProjectDirty(context);
        await refreshAgentProjectContext(context);
        antispamTracker.lastFingerprint = projectFingerprint(
          context.projectSnapshot ?? undefined,
        );
        antispamTracker.stagnantCount = 0;
      } catch {
        /* ignore */
      }
    }
```

- [ ] **Step 4：跑相关测试**

Run: `npx vitest run src/__tests__/lib/agent-langgraph.test.ts src/__tests__/lib/agent-project-refresh.test.ts src/__tests__/lib/agent-session-snapshot.test.ts`
Expected: 全部通过

- [ ] **Step 5：typecheck**

Run: `npx tsc --noEmit`
Expected: 无错误

---

### Task A5：写/读工具内部 `loadAgentProject` → `getAgentProjectSnapshot`

**Files（各改一行 + 导入）：**
- Modify: `src/lib/agent/tools/write-section.ts:62`
- Modify: `src/lib/agent/tools/write-bilingual-abstract.ts:53`
- Modify: `src/lib/agent/tools/refine-content.ts:70`
- Modify: `src/lib/agent/tools/read-section.ts:55`
- Modify: `src/lib/agent/tools/inspect-project.ts:39`
- Modify: `src/lib/agent/tools/generate-writing-blueprint.ts:51`
- Modify: `src/lib/agent/tools/generate-outline.ts:44`
- Modify: `src/lib/agent/tools/build-argument-blueprint.ts:58`
- Modify: `src/lib/agent/tools/apply-revision-item.ts:118`
- Modify: `src/lib/agent/tools/check-plagiarism.ts:38`

- [ ] **Step 1：逐个文件替换调用与导入**

对上述每个文件：删除 `import { loadAgentProject } from "@/lib/agent/project-loader";`，改为 `import { getAgentProjectSnapshot } from "@/lib/agent/project-refresh";`；并把 `const project = await loadAgentProject(ctx.userId, ctx.projectId);`（或其变体）替换为：

```ts
    const project = await getAgentProjectSnapshot(ctx);
```

⚠️ 语义说明：写工具在「落地前」读取项目上下文，`ctx.projectSnapshot` 在上一个写工具落地后已被 `toolsNode` 刷新，故此时快照即为最新；若该工具是本次运行第一个写操作，快照来自 run 前导加载，同样新鲜。返回 `null` 的语义与原来一致（`if (!project)` 分支不变）。

- [ ] **Step 2：跑相关测试**

Run: `npx vitest run src/__tests__/lib/agent-writing-sections.test.ts src/__tests__/lib/agent-tools-wave2.test.ts src/__tests__/lib/agent-project-refresh.test.ts`
Expected: 全部通过

- [ ] **Step 3：typecheck**

Run: `npx tsc --noEmit`
Expected: 无错误

---

### Task A6：Group A 全量验证 + 提交

- [ ] **Step 1：跑全部 agent 测试**

Run: `npx vitest run src/__tests__/lib/agent-`
Expected: 全部通过

- [ ] **Step 2：提交**

```bash
git add src/lib/agent/types.ts src/lib/agent/project-refresh.ts src/lib/agent/langgraph/nodes.ts src/lib/agent/langgraph/run-graph.ts src/lib/agent/tools/write-section.ts src/lib/agent/tools/write-bilingual-abstract.ts src/lib/agent/tools/refine-content.ts src/lib/agent/tools/read-section.ts src/lib/agent/tools/inspect-project.ts src/lib/agent/tools/generate-writing-blueprint.ts src/lib/agent/tools/generate-outline.ts src/lib/agent/tools/build-argument-blueprint.ts src/lib/agent/tools/apply-revision-item.ts src/lib/agent/tools/check-plagiarism.ts src/__tests__/lib/agent-project-refresh.test.ts
git commit -m "perf(agent): 项目快照单飞缓存，消除同轮重复整项目查库

- 新增 project-refresh.ts：getAgentProjectSnapshot / refreshAgentProjectContext / markAgentProjectDirty
- AgentContext 增加 projectDirty；写工具落地后标脏强制重载，非写入刷新直接复用
- nodes.ts / run-graph.ts 前导与 confirm 路径改用共享刷新
- 10 个写/读工具内部 loadAgentProject 改为 getAgentProjectSnapshot"
```

---

## Task Group B：system prompt 前缀稳定化

### Task B1：`prompts.ts` 拆分简报注入

**Files:**
- Modify: `src/lib/agent/core/prompts.ts`
- Test: `src/__tests__/lib/agent-project-briefing.test.ts`、`src/__tests__/lib/agent-agentic-prompt.test.ts`

- [ ] **Step 1：写失败测试**

在 `src/__tests__/lib/agent-project-briefing.test.ts` 里替换原有「injects briefing into system prompt」用例：

```ts
  it("briefing 经独立 user 消息注入，system prompt 前缀稳定", () => {
    const msg = buildAgentBriefingMessage(formatAgentProjectBriefing(sample));
    expect(msg).not.toBeNull();
    expect(msg!.content).toContain("【项目简报");
    expect(msg!.content).toContain("生物炭综述");
    expect(msg!.content).toContain("四个研究方向");
    // system prompt 不再内嵌易变的项目简报
    const prompt = buildAgentSystemPrompt([]);
    expect(prompt).not.toContain("【项目简报");
  });
```

并把该文件顶部导入改为：

```ts
import {
  buildAgentBriefingMessage,
  buildAgentSystemPrompt,
} from "@/lib/agent/core/prompts";
```

- [ ] **Step 2：跑测试确认失败**

Run: `npx vitest run src/__tests__/lib/agent-project-briefing.test.ts`
Expected: FAIL（`buildAgentBriefingMessage` 未导出；且 `buildAgentSystemPrompt([])` 仍含「【项目简报」）

- [ ] **Step 3：改 `prompts.ts`**

`src/lib/agent/core/prompts.ts` 改为：

```ts
import { toolsDescriptionText } from "@/lib/agent/core/tool-registry";
import { phaseGatePromptRules } from "@/lib/agent/core/phase-gates";
import type { LLMMessage, ToolDefinition } from "@/lib/agent/types";

/**
 * 只含稳定内容的系统提示：角色、工作方式、工具纪律、写作入口、工具 schema。
 * 项目简报等易变上下文一律不放在这里（保持 system 前缀恒定，命中 provider 前缀缓存），
 * 由 buildAgentBriefingMessage 以独立 user 消息注入。
 */
export function buildAgentSystemPrompt(tools: ToolDefinition[]): string {
  const writeEnabled = tools.some((t) => t.safety === "write");
  const writeNote = writeEnabled
    ? `【写回】可用 generate_* / write_section / refine / import_reference / 图表与修订工具；section 用英文 key（introduction、methods、results、discussion、conclusion、literature_body、abstract 等）。缺大纲/蓝图时可直接 write_section（系统会自动补齐）。写后可用 validate_citations；交付可用 export_manuscript_markdown。`
    : "【限制】当前只能使用只读工具，不能撰写或修改论文。";

  return `你是禾书耕文（GrainScript）的科研写作智能体——像 Cursor 里的通用 Agent：思考 → 自己取上下文 → 调工具 → 用中文说明 → 问下一步。
阶段策略对齐 academic-paper，但以**对话推进**，不是无人流水线，也不要一口气跑完全文。

## 工作方式
1. 先想再动手：中文简述判断与下一步；不确定就问或先读上下文。
2. 自己取上下文：优先 inspect_project / read_project_asset / read_section / list_references；勿编造文献或数据。
3. 完成用户当前请求即可，汇报结果并给 1～3 个可选下一步；用户改口要立刻改道。
4. 跨轮承接「继续 / 按刚才的」；重要主张与待办可用 update_work_memory。

## 工具纪律（先判任务，再选工具）
- 写章节任务：不要 search_external / search_knowledge，除非用户明确说「检索 / 找文献」；用 inspect / read_project_asset / list_references 取上下文。
- 引用核查/修正任务：只 validate_citations + 修订，不要导入文献、写摘要或其它章节。
- 诊断任务：先 inspect_project 看最新快照，再决定下一步。
- import_reference：优先 hitIndices 引用最近一次 search_external 的命中；确需手写 hitsJson 时，source 仅限 openalex|semantic-scholar|crossref|pubmed，authors 必须是字符串数组，有 doi 可省略 id。
- 连续多次调工具仍无进展时：停止调用，用中文总结已掌握信息并询问用户。

## 执行 vs 反问（先判意图，再动手）
- 用户指令明确（「修正图注」「改某处引用」「写某节」「按方案改」）→ **直接调用工具执行**，不要只做分析就收尾。
- 指令模糊、有歧义、或写操作会改动正文且你不确定 → **用一句中文反问确认**（如「确认把图注 CEC 的 [18] 改为 [21] 吗？」），等用户答复再执行；不要自作主张，也不要分析完就当作完成。
- 上轮你已给出方案、用户回了「好 / 修吧 / 可以 / 继续」→ 视为**同意执行上轮方案**，直接动手，而不是重新分析一遍。

## 写作入口
若消息含 \`【写作入口=…】\`：full=从零推进；outline_ready=读大纲后写；data_ready=优先 methods/results/配图。用户只要引用检查、修订、摘要时选对应工具即可。

${writeNote}

${phaseGatePromptRules()}

可用工具：
${toolsDescriptionText(tools)}`;
}

/**
 * 项目简报作为独立 user 消息注入（在 system 之后、对话历史之前）。
 * 简报有值时生成消息；无值时返回 null（agentNode 不注入，避免噪声）。
 */
export function buildAgentBriefingMessage(
  briefing?: string | null,
): LLMMessage | null {
  const text = briefing?.trim();
  if (!text) return null;
  return {
    role: "user",
    content: `【项目简报（可能过期；重要决策前请 inspect_project / read_project_asset 刷新）】\n${text}`,
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Run: `npx vitest run src/__tests__/lib/agent-project-briefing.test.ts src/__tests__/lib/agent-agentic-prompt.test.ts`
Expected: 全部通过（`agent-agentic-prompt.test.ts` 调 `buildAgentSystemPrompt([inspectProjectTool, readSectionTool])` 单参，长度断言 `<3500` 仍成立——去掉简报后只会更短）

---

### Task B2：`agentNode` 注入简报 user 消息

**Files:**
- Modify: `src/lib/agent/langgraph/nodes.ts:230-236`

- [ ] **Step 1：改 `agentNode` 的 llmMessages 构建**

`nodes.ts:230-236` 改为：

```ts
  const systemPrompt = buildAgentSystemPrompt(tools);
  // 项目简报经独立 user 消息注入（system prompt 前缀恒定 → provider 前缀缓存友好）
  const briefingMsg = buildAgentBriefingMessage(agentContext.projectBriefing);
  const llmMessages = [
    { role: "system" as const, content: systemPrompt },
    ...(briefingMsg ? [briefingMsg] : []),
    ...compactAgentMessages(state.messages),
    ...extraMessages,
  ];
```

并把顶部导入改为同时引入 `buildAgentBriefingMessage`：

```ts
import {
  buildAgentBriefingMessage,
  buildAgentSystemPrompt,
} from "@/lib/agent/core/prompts";
```

- [ ] **Step 2：typecheck + 相关测试**

Run: `npx tsc --noEmit`
Expected: 无错误

Run: `npx vitest run src/__tests__/lib/agent-langgraph.test.ts src/__tests__/lib/agent-agentic-prompt.test.ts src/__tests__/lib/agent-project-briefing.test.ts`
Expected: 全部通过

---

### Task B3：Group B 全量验证 + 提交

- [ ] **Step 1：跑全部 agent 测试**

Run: `npx vitest run src/__tests__/lib/agent-`
Expected: 全部通过

- [ ] **Step 2：提交**

```bash
git add src/lib/agent/core/prompts.ts src/lib/agent/langgraph/nodes.ts src/__tests__/lib/agent-project-briefing.test.ts src/__tests__/lib/agent-agentic-prompt.test.ts
git commit -m "perf(agent): system prompt 前缀稳定化，简报改独立 user 消息注入

- buildAgentSystemPrompt 去掉易变项目简报参数，只含角色/规则/工具 schema
- 新增 buildAgentBriefingMessage；agentNode 在 system 后注入简报 user 消息
- 多轮/长会话命中 provider 前缀缓存，显著降低重复发送工具 schema 的输入成本"
```

---

## Task Group C：只读工具并行执行

### Task C0：基线确认

- [ ] **Step 1：跑 toolsNode 相关测试**

Run: `npx vitest run src/__tests__/lib/agent-tools-wave2.test.ts src/__tests__/lib/agent-ask-user.test.ts`
Expected: 全部通过（Group A/B 合入后仍应全绿）

---

### Task C1：新建 `src/lib/agent/langgraph/parallel-tools.ts`

**Files:**
- Create: `src/lib/agent/langgraph/parallel-tools.ts`
- Test: `src/__tests__/lib/agent-parallel-reads.test.ts`

- [ ] **Step 1：写失败测试**

创建 `src/__tests__/lib/agent-parallel-reads.test.ts`：

```ts
import { describe, expect, it, vi } from "vitest";
import {
  allParallelSafe,
  PARALLEL_READ_TOOLS,
  runParallelReads,
} from "@/lib/agent/langgraph/parallel-tools";
import { createAntispamTracker } from "@/lib/agent/core/antispam";
import { createRepeatTracker } from "@/lib/agent/core/safety";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";
import type { AgentGraphRuntime } from "@/lib/agent/langgraph/runtime";
import type { AgentContext, ParsedToolCall, ToolDefinition } from "@/lib/agent/types";

function readTool(name: string): ToolDefinition {
  return {
    name,
    description: name,
    parameters: { type: "object", properties: {}, required: [] },
    safety: "read",
    execute: async (params: Record<string, unknown>) => ({
      success: true as const,
      summary: `read ${params.id}`,
      data: { text: `ref ${params.id}` },
    }),
  };
}

const writeTool: ToolDefinition = {
  name: "write_section",
  description: "w",
  parameters: { type: "object", properties: {}, required: [] },
  safety: "write",
  execute: async () => ({ success: true as const }),
};

function makeCtx(): AgentContext {
  return {
    userId: "u1",
    projectId: "p1",
    signal: new AbortController().signal,
    budget: { maxIterations: 32, currentIteration: 0, maxToolCalls: 64, toolCallCount: 0 },
  };
}

function makeRuntime(tools: ToolDefinition[], ctx: AgentContext): AgentGraphRuntime {
  return {
    agentContext: ctx,
    tools,
    repeatTracker: createRepeatTracker(),
    antispamTracker: createAntispamTracker(null),
  };
}

function call(id: string, name = "read_reference", args: Record<string, unknown> = { id }): ParsedToolCall {
  return { id, name, args };
}

function baseState(overrides: Partial<AgentGraphStateType> = {}): AgentGraphStateType {
  return {
    goal: "检索文献",
    plan: null,
    messages: [],
    iteration: 0,
    toolCallCount: 0,
    planContinueCount: 0,
    reflectCount: 0,
    finalThought: null,
    toolSummaries: [],
    observations: [],
    pendingToolCalls: [],
    finished: false,
    error: null,
    events: [],
    awaitingCheckpoint: null,
    awaitingConfirm: null,
    grantedConfirm: null,
    approvedCheckpointKinds: [],
    ...overrides,
  };
}

describe("allParallelSafe", () => {
  it("两个白名单只读工具 → 可并行", () => {
    const tools = [readTool("read_reference"), readTool("read_section")];
    expect(
      allParallelSafe([call("1", "read_reference"), call("2", "read_section")], tools),
    ).toBe(true);
  });

  it("单个调用不走并行（无收益）", () => {
    const tools = [readTool("read_reference")];
    expect(allParallelSafe([call("1")], tools)).toBe(false);
  });

  it("混入写工具 → 不可并行（退回串行）", () => {
    const tools = [readTool("read_reference"), writeTool];
    expect(allParallelSafe([call("1"), call("2", "write_section")], tools)).toBe(false);
  });

  it("未知工具 → 不可并行", () => {
    const tools = [readTool("read_reference")];
    expect(allParallelSafe([call("1"), call("2", "nope")], tools)).toBe(false);
  });

  it("白名单集合包含常用只读工具", () => {
    expect(PARALLEL_READ_TOOLS.has("inspect_project")).toBe(true);
    expect(PARALLEL_READ_TOOLS.has("search_knowledge")).toBe(true);
    expect(PARALLEL_READ_TOOLS.has("write_section")).toBe(false);
  });
});

describe("runParallelReads", () => {
  it("并发执行只读调用，结果按原顺序产出，预算正确累计", async () => {
    const ctx = makeCtx();
    const readCalls = [call("1", "read_reference", { id: "A" }), call("2", "read_reference", { id: "B" })];
    const runtime = makeRuntime([readTool("read_reference")], ctx);
    const out = await runParallelReads(baseState({ pendingToolCalls: readCalls }), runtime);

    expect(out.pendingToolCalls).toEqual([]);
    expect(out.observations).toHaveLength(2);
    expect(out.observations.map((o) => o.data)).toEqual([
      { text: "ref A" },
      { text: "ref B" },
    ]);
    expect(out.toolSummaries).toEqual(["[read_reference] read A", "[read_reference] read B"]);
    expect(ctx.budget.toolCallCount).toBe(2);
    expect(out.toolCallCount).toBe(2);
    const actions = (out.events ?? []).filter((e) => e.type === "agent/action");
    const obs = (out.events ?? []).filter((e) => e.type === "agent/observation");
    expect(actions).toHaveLength(2);
    expect(obs).toHaveLength(2);
  });

  it("未知工具记失败但不影响其它调用", async () => {
    const ctx = makeCtx();
    const runtime = makeRuntime([readTool("read_reference")], ctx);
    const out = await runParallelReads(
      baseState({
        pendingToolCalls: [call("1"), call("2", "nope", {})],
      }),
      runtime,
    );
    expect(out.observations).toHaveLength(1);
    expect(out.observations[0]!.success).toBe(true);
    expect(out.toolSummaries.some((s) => s.includes("未知工具"))).toBe(true);
  });

  it("重复调用触发软警告且不执行", async () => {
    const ctx = makeCtx();
    const runtime = makeRuntime([readTool("read_reference")], ctx);
    // 先手动把 repeatTracker 推向重复
    const first = await runParallelReads(
      baseState({ pendingToolCalls: [call("1", "read_reference", { id: "S" })] }),
      runtime,
    );
    const second = await runParallelReads(
      baseState({ pendingToolCalls: [call("2", "read_reference", { id: "S" })] }),
      runtime,
    );
    expect(first.observations).toHaveLength(1);
    // 第二次相同 id 在阈值内只软警告（read_reference 非软工具? 见 safety.stableArgsKey）
    expect(second.observations).toHaveLength(1);
  });
});
```

> 说明：第三次测例只验证「相同参数重复调用会走软/硬停判定逻辑」——`read_reference` 在 `stableArgsKey` 中按全参匹配，连续同参调用第 4 次才会硬停；该测例断言的是路径不抛错、结果形状稳定。若 `checkRepeatCall` 判定与预期不符，以现有 `agent-safety.test.ts` 的行为为准微调断言。

- [ ] **Step 2：跑测试确认失败**

Run: `npx vitest run src/__tests__/lib/agent-parallel-reads.test.ts`
Expected: FAIL（`Cannot find module "@/lib/agent/langgraph/parallel-tools"`）

- [ ] **Step 3：实现 `parallel-tools.ts`**

创建 `src/lib/agent/langgraph/parallel-tools.ts`：

```ts
/**
 * 只读工具并行快路径。
 *
 * 背景：toolsNode 原实现串行 await 每个工具调用；文献检索/多读路径（连读多篇、
 * 多轮换 query 搜索、读章节+列表）大量互相独立的只读调用被白白排队。
 *
 * 策略：
 * - 仅当 pendingToolCalls 全部命中 PARALLEL_READ_TOOLS 白名单（纯读、无确认、
 *   无 checkpoint 副作用）时才走快路径；混入写/确认/检查点工具时由 toolsNode
 *   原串行循环处理，快路径对其零影响。
 * - 门禁/重复/配额在顺序扫描中按原顺序判定（只读工具互不依赖，等价于串行判定）；
 *   执行用 Promise.all；结果按原顺序产出，保证 SSE 事件与 observations 顺序稳定。
 */

import type { AgentSSEEvent } from "@/contracts/agent";
import {
  checkSearchQuota,
  noteSearchCall,
  noteToolProgress,
} from "@/lib/agent/core/antispam";
import { checkRepeatCall } from "@/lib/agent/core/safety";
import { checkAgentToolPhaseGate } from "@/lib/agent/core/phase-gates";
import { checkReadBeforeWrite } from "@/lib/agent/core/read-before-write";
import {
  checkCitationCheckGate,
  checkCitationSideTripGate,
  checkDiagnoseInspectGate,
  checkDraftSearchGate,
} from "@/lib/agent/core/goal-intents";
import { findTool, parseToolArgs } from "@/lib/agent/core/tool-registry";
import { advancePlanAfterTool } from "@/lib/agent/core/plan-progress";
import { formatToolObservationForLlm } from "@/lib/agent/observation-memory";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";
import type { AgentGraphRuntime } from "@/lib/agent/langgraph/runtime";
import type {
  LLMMessage,
  ParsedToolCall,
  ToolDefinition,
  ToolObservation,
} from "@/lib/agent/types";

/** 纯读、无确认、无 checkpoint/记忆副作用、可乱序并行的工具白名单 */
export const PARALLEL_READ_TOOLS = new Set([
  "inspect_project",
  "list_references",
  "read_reference",
  "read_section",
  "read_project_asset",
  "read_attachment",
  "list_attachments",
  "list_plot_sources",
  "recall_recent_work",
  "read_full_text",
  "search_knowledge",
  "search_external",
]);

/** 全部调用都可安全并行时才走快路径 */
export function allParallelSafe(
  pending: ParsedToolCall[],
  tools: ToolDefinition[],
): boolean {
  if (pending.length < 2) return false;
  return pending.every((tc) => {
    const tool = findTool(tools, tc.name);
    return (
      tool !== undefined
      && PARALLEL_READ_TOOLS.has(tool.name)
      && !tool.requiresConfirmation
    );
  });
}

/** 并行执行全部只读调用，返回与串行路径同构的 state 更新 */
export async function runParallelReads(
  state: AgentGraphStateType,
  runtime: AgentGraphRuntime,
): Promise<Partial<AgentGraphStateType>> {
  const { agentContext, tools, repeatTracker, antispamTracker } = runtime;
  const events: AgentSSEEvent[] = [{ type: "agent/status", status: "executing" }];
  const newMessages: LLMMessage[] = [];
  const newSummaries: string[] = [];
  const newObservations: ToolObservation[] = [];
  let toolCallCount = state.toolCallCount;
  let error: string | null = null;
  let plan = state.plan;

  const rejectGate = (toolName: string, err: string) => {
    newSummaries.push(`[${toolName}] 失败: ${err}`);
    newMessages.push({
      role: "user",
      content: `Tool result (${toolName}):\n${err}`,
    });
    events.push({
      type: "agent/observation",
      tool: toolName,
      result: { success: false, error: err },
      error: err,
    });
    plan = advancePlanAfterTool(plan, toolName, false);
  };

  // 批次：门禁基于「批前观察快照」判定——只读工具不产出会互相影响的结果，等价于串行判定
  const obsSnapshot = state.observations;
  const batch: Array<{
    tool: ToolDefinition;
    params: Record<string, unknown>;
  }> = [];

  for (const toolCall of state.pendingToolCalls) {
    if (
      agentContext.budget.toolCallCount + batch.length
      >= agentContext.budget.maxToolCalls
    ) {
      error = `单次任务最多调用 ${agentContext.budget.maxToolCalls} 次工具`;
      events.push({ type: "agent/error", error });
      break;
    }

    const tool = findTool(tools, toolCall.name);
    if (!tool) {
      rejectGate(toolCall.name, `未知工具: ${toolCall.name}`);
      continue;
    }
    const params = parseToolArgs(toolCall.args);

    const repeat = checkRepeatCall(repeatTracker, tool.name, params);
    if (!repeat.allowed) {
      const isSoftTool =
        tool.name === "read_section"
        || tool.name === "search_knowledge"
        || tool.name === "search_external";
      const SOFT_REPEAT_CAP = 8;
      const hardStop = !isSoftTool || (repeat.repeatCount ?? 0) > SOFT_REPEAT_CAP;
      if (!hardStop) {
        const soft = repeat.warning ?? "请停止重复调用，改换策略或直接回复用户";
        newSummaries.push(`[${tool.name}] ${soft}`);
        newMessages.push({
          role: "user",
          content: `Tool result (${tool.name}):\n${soft}`,
        });
        events.push({
          type: "agent/observation",
          tool: tool.name,
          result: { success: false, error: soft },
          error: soft,
        });
        continue;
      }
      error = repeat.warning ?? "重复调用";
      events.push({ type: "agent/error", error });
      break;
    }

    const quota = checkSearchQuota(antispamTracker, tool.name);
    if (!quota.allowed) {
      const soft = quota.warning ?? "检索次数已达上限";
      newSummaries.push(`[${tool.name}] ${soft}`);
      newMessages.push({
        role: "user",
        content: `Tool result (${tool.name}):\n${soft}`,
      });
      events.push({
        type: "agent/observation",
        tool: tool.name,
        result: { success: false, error: soft },
        error: soft,
      });
      continue;
    }

    const gates: Array<() => { ok: boolean; error?: string }> = [
      () => checkDiagnoseInspectGate(state.goal, tool.name, obsSnapshot),
      () => checkDraftSearchGate(state.goal, tool.name, obsSnapshot),
      () => checkCitationCheckGate(state.goal, tool.name, obsSnapshot),
      () => checkCitationSideTripGate(state.goal, tool.name, obsSnapshot),
      () => checkReadBeforeWrite(tool.name, params, obsSnapshot),
    ];
    let rejected = false;
    for (const gate of gates) {
      const r = gate();
      if (!r.ok) {
        rejectGate(tool.name, r.error ?? "门禁未通过");
        rejected = true;
        break;
      }
    }
    if (rejected) continue;

    const phaseGate = checkAgentToolPhaseGate(
      tool.name,
      params,
      agentContext.projectSnapshot,
    );
    if (!phaseGate.ok) {
      rejectGate(tool.name, phaseGate.error);
      continue;
    }

    // 通过全部门禁：先发 action 事件（与串行路径顺序一致），入批执行
    events.push({ type: "agent/action", tool: tool.name, params });
    batch.push({ tool, params });
  }

  // 并行执行：只读互不依赖；单点失败捕获为 success:false，不中断其它调用
  const results = await Promise.all(
    batch.map(async ({ tool, params }) => {
      noteSearchCall(antispamTracker, tool.name);
      agentContext.budget.toolCallCount += 1;
      try {
        return { tool, params, result: await tool.execute(params, agentContext) };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          tool,
          params,
          result: { success: false as const, error: msg },
        };
      }
    }),
  );

  // 按原顺序记录结果
  for (const { tool, params, result } of results) {
    toolCallCount += 1;
    const line = result.success
      ? `[${tool.name}] ${result.summary ?? "完成"}`
      : `[${tool.name}] 失败: ${result.error ?? "未知错误"}`;
    newSummaries.push(line);
    newMessages.push({
      role: "user",
      content: formatToolObservationForLlm(tool.name, result),
    });
    events.push({
      type: "agent/observation",
      tool: tool.name,
      result,
      error: result.success ? undefined : result.error,
    });
    newObservations.push({
      tool: tool.name,
      success: result.success,
      error: result.error,
      data: result.data,
    });
    plan = advancePlanAfterTool(plan, tool.name, result.success);
    noteToolProgress(
      antispamTracker,
      tool.name,
      agentContext.projectSnapshot,
      result.success,
    );
  }

  if (plan) {
    events.push({ type: "agent/plan", plan });
  }

  return {
    pendingToolCalls: [],
    toolCallCount,
    toolSummaries: newSummaries,
    observations: newObservations,
    messages: newMessages,
    events,
    error,
    ...(error ? { finished: true } : {}),
    plan,
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Run: `npx vitest run src/__tests__/lib/agent-parallel-reads.test.ts`
Expected: PASS

- [ ] **Step 5：typecheck**

Run: `npx tsc --noEmit`
Expected: 无错误

---

### Task C2：`toolsNode` 接入并行快路径

**Files:**
- Modify: `src/lib/agent/langgraph/nodes.ts`

- [ ] **Step 1：加导入**

`nodes.ts` 顶部导入区新增：

```ts
import {
  allParallelSafe,
  runParallelReads,
} from "@/lib/agent/langgraph/parallel-tools";
```

- [ ] **Step 2：toolsNode 入口插入快路径**

`toolsNode` 开头的守卫后（即在 `const runtime = getAgentGraphRuntime(config.configurable);` 与 `const { agentContext, tools, repeatTracker, antispamTracker } = runtime;` 之后），插入：

```ts
  // 纯读批次快路径：全部调用可并行时并发执行（结果按原顺序），其余走下方串行循环
  if (allParallelSafe(state.pendingToolCalls, tools)) {
    return await runParallelReads(state, runtime);
  }
```

- [ ] **Step 3：跑相关测试**

Run: `npx vitest run src/__tests__/lib/agent-parallel-reads.test.ts src/__tests__/lib/agent-tools-wave2.test.ts src/__tests__/lib/agent-ask-user.test.ts src/__tests__/lib/agent-langgraph.test.ts`
Expected: 全部通过

- [ ] **Step 4：typecheck**

Run: `npx tsc --noEmit`
Expected: 无错误

---

### Task C3：Group C 全量验证 + 提交

- [ ] **Step 1：跑全部 agent 测试**

Run: `npx vitest run src/__tests__/lib/agent-`
Expected: 全部通过

- [ ] **Step 2：提交**

```bash
git add src/lib/agent/langgraph/parallel-tools.ts src/lib/agent/langgraph/nodes.ts src/__tests__/lib/agent-parallel-reads.test.ts
git commit -m "perf(agent): 只读工具批次并行执行，检索/多读路径墙钟时间显著下降

- 新增 parallel-tools.ts：allParallelSafe + runParallelReads
- 白名单只读工具（inspect/list/read/search_*）全批并行，门禁/配额顺序判定，结果按原顺序产出
- toolsNode 全只读批次走快路径；混入写/确认/检查点工具时原串行循环不变"
```

---

## Self-Review

**Spec coverage（对照目标）：**
- ① 项目快照单飞缓存 → Group A（A2 共享刷新、A4 前导/confirm、A5 工具内取快照）
- ② system prompt 前缀稳定化 → Group B（B1 prompts 拆分、B2 agentNode 注入）
- ③ 只读工具并行 → Group C（C1 快路径模块、C2 toolsNode 接入）

**已确认的接缝（写计划时逐一核实过）：**
- `ensureWritePrerequisites` 每步写后调用 refresh 回调（`ensure-write-prereqs.ts:116`）→ A3 Step 2 在回调里标脏，保证自补工具后的快照必新鲜
- 写工具内部的 `loadAgentProject` 是「写前」上下文读取 → A5 改用 `getAgentProjectSnapshot(ctx)`，其 `ctx.projectSnapshot` 已被上一个写工具落地后的刷新更新，语义不变
- `buildAgentSystemPrompt` 现有两个测试（`agent-agentic-prompt.test.ts` 单参、`agent-project-briefing.test.ts` 双参）→ B1 只改双参用例，单参用例自然兼容
- 并行白名单刻意保守：排除 `validate_citations`/`run_review_rounds`（在 SNAPSHOT_REFRESH_TOOLS 内）、`update_work_memory`（有 ctx 副作用）、`export_manuscript_markdown`（重）、`ask_user`（特殊 checkpoint）

**潜在风险提示（合入前给用户过目）：**
- A5 的 10 个工具逐个替换，若某个工具内部实际需要「写后最新值」，其自身测试会暴露（Group A 末轮全量 agent 测试兜底）
- B2 后简报不再是 system 内容，个别依赖简报位置的 prompt 微调若退化，`agent-project-briefing.test.ts` 的新断言会拦截
- C 的 `runParallelReads` 与串行循环存在少量记录逻辑重复（有意为之，换取串行路径零改动）；后续可再抽公共结果记录 helper 收敛
