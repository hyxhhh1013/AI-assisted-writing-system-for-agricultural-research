# 常驻写状态卡（WritingStatusCard）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `agent/progress` 从 label 升级为结构化写状态，新增常驻 `WritingStatusCard`，修掉写链路 UI 断点 C1/C2/C3/H3/L3/M1。

**Architecture:** 服务端写管道事件经 `writing-progress.ts` 翻译成结构化 `agent/progress`（stage/detail/chars/elapsedMs/info/warnings），`use-agent.ts` 维护 `writeStatus` 生命周期，新组件 `WritingStatusCard` 渲染阶段 stepper + 统计 + 完成摘要。Verifier 流式输出中解析 `〔进度 n/N〕` 标记实现逐条引用计数，无标记时回退字符数。

**Tech Stack:** Next.js (App Router), TypeScript, SSE, Vitest, framer-motion, lucide-react。

**前置:** 设计规格 `docs/superpowers/specs/2026-08-07-writing-status-card-design.md`（已批准）。Wave 1（label 透传）已实现。
**执行注意:** 工作树存在他人 WIP（goal-intents/reflect/writing-concurrency/admin stats），**只 git add 本计划涉及的文件**，勿 `git add -A`。

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/contracts/sse.ts` | 写管道 SSE 契约 | 改：加 `verification_progress` |
| `src/contracts/agent.ts` | Agent SSE 契约 | 改：`agent/progress` 结构化 + `WritingStage` |
| `src/lib/agent/write-status.ts` | 写状态纯逻辑（init/merge/finalize） | 新建 |
| `src/lib/agent/writing-progress.ts` | 管道事件→结构化 progress 翻译 | 重写 |
| `src/lib/agent/tools/write-section.ts` | 工具发射结构化 `agent/progress` | 改 |
| `src/lib/prompts/writing.ts` | Verifier prompt（进度标记指令） | 改 |
| `src/app/api/writing/pipeline/verifier.ts` | 解析 `〔进度 n/N〕` → `verification_progress` | 改 |
| `src/hooks/use-agent.ts` | `writeStatus` 状态 + 生命周期 | 改 |
| `src/components/shared/agent/writing-status-card.tsx` | 常驻写状态卡 | 新建 |
| `src/components/shared/agent/agent-panel.tsx` | 渲染卡片；写进度职责移交 | 改 |
| `src/__tests__/lib/agent-write-status.test.ts` | 纯逻辑测试 | 新建 |
| `src/__tests__/lib/agent-writing-progress.test.ts` | 翻译层测试 | 重写断言 |
| `src/__tests__/lib/agent-verifier-progress.test.ts` | verifier 标记解析测试 | 新建 |
| `docs/domain/agent.md` | 文档同步 | 改 |

---

### Task 1: 契约扩展

**Files:**
- Modify: `src/contracts/sse.ts`
- Modify: `src/contracts/agent.ts`

- [ ] **Step 1: `src/contracts/sse.ts` 加 `verification_progress` 事件**

在 `SSEBulletDoneEvent` 定义之后（现 line 24 之后）插入：

```ts
export interface SSEVerificationProgressEvent {
  type: "verification_progress";
  checked: number;
  total: number;
}
```

把 `WritingSSEEvent` 联合（line 27-40）末尾追加 `| SSEVerificationProgressEvent`，并在文件末尾守卫区（line 58 之后）追加：

```ts
export function isVerificationProgressEvent(e: unknown): e is SSEVerificationProgressEvent { return (e as SSEEvent).type === "verification_progress"; }
```

- [ ] **Step 2: `src/contracts/agent.ts` 加 `WritingStage` + 结构化 `agent/progress`**

在 `AgentStatus` 定义（line 3-11）之后插入：

```ts
export type WritingStage =
  | "retrieving"
  | "writing"
  | "verifying"
  | "refining"
  | "completed"
  | "error";
```

把 `agent/progress` 成员（line 79）替换为（新字段全可选，兼容旧服务器只发 label）：

```ts
  | {
      type: "agent/progress";
      label: string;
      stage?: WritingStage;
      detail?: string;
      chars?: number;
      elapsedMs?: number;
      info?: string[];
      warnings?: string[];
    }
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 通过（若 `agent/progress` 消费方因新字段编译错误，见 Task 4/6 同步更新）。

- [ ] **Step 4: Commit**

```bash
git add src/contracts/sse.ts src/contracts/agent.ts
git commit -m "feat(agent-ui): 结构化 agent/progress + verification_progress 契约"
```

---

### Task 2: 写状态纯逻辑（write-status.ts）

**Files:**
- Create: `src/lib/agent/write-status.ts`
- Test: `src/__tests__/lib/agent-write-status.test.ts`

- [ ] **Step 1: 写失败测试**

Create `src/__tests__/lib/agent-write-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  initWriteStatus,
  mergeProgressIntoWriteStatus,
  finalizeWriteStatus,
} from "@/lib/agent/write-status";

describe("write-status 纯逻辑", () => {
  it("init 生成空状态（stage=null，等待首个事件）", () => {
    expect(initWriteStatus("引言")).toEqual({
      section: "引言",
      stage: null,
      chars: 0,
      elapsedMs: 0,
      info: [],
      warnings: [],
    });
  });

  it("merge 覆盖 stage/detail/chars，累积 info/warnings 并去重", () => {
    let s = initWriteStatus("引言");
    s = mergeProgressIntoWriteStatus(s, { label: "x", stage: "retrieving", detail: "检索文献中…", chars: 0, elapsedMs: 100 });
    s = mergeProgressIntoWriteStatus(s, { label: "x", stage: "writing", detail: "生成初稿… 已 3 字", chars: 3, elapsedMs: 400 });
    s = mergeProgressIntoWriteStatus(s, { label: "x", info: ["已扩大全库检索"] });
    s = mergeProgressIntoWriteStatus(s, { label: "x", info: ["已扩大全库检索"] });
    expect(s).toMatchObject({ stage: "writing", chars: 3, info: ["已扩大全库检索"] });
    expect(s.info).toHaveLength(1);
  });

  it("finalize 成功 → completed + done 摘要（full 无问题=通过）", () => {
    const s = finalizeWriteStatus(initWriteStatus("引言"), {
      success: true,
      charCount: 1450,
      issueCount: 0,
      pipelineMode: "full",
      verification: "核查通过",
    });
    expect(s.stage).toBe("completed");
    expect(s.done).toEqual({ chars: 1450, issueCount: 0, passed: true, verification: "核查通过" });
  });

  it("finalize 失败 → stage=error + error 信息", () => {
    const s = finalizeWriteStatus(initWriteStatus("引言"), { success: false, error: "AI 调用失败" });
    expect(s.stage).toBe("error");
    expect(s.error).toBe("AI 调用失败");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/__tests__/lib/agent-write-status.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 write-status.ts**

Create `src/lib/agent/write-status.ts`:

```ts
import type { WritingStage } from "@/contracts/agent";

export interface WriteStatus {
  section: string;
  stage: WritingStage | null;
  detail?: string;
  chars: number;
  elapsedMs: number;
  info: string[];
  warnings: string[];
  done?: { chars: number; issueCount: number; passed: boolean; verification?: string };
  error?: string;
}

export interface WriteProgressPayload {
  label: string;
  stage?: WritingStage;
  detail?: string;
  chars?: number;
  elapsedMs?: number;
  info?: string[];
  warnings?: string[];
}

export function initWriteStatus(section: string): WriteStatus {
  return { section, stage: null, chars: 0, elapsedMs: 0, info: [], warnings: [] };
}

export function mergeProgressIntoWriteStatus(
  status: WriteStatus,
  payload: WriteProgressPayload,
): WriteStatus {
  const next: WriteStatus = { ...status, info: [...status.info], warnings: [...status.warnings] };
  if (payload.stage) next.stage = payload.stage;
  if (payload.detail !== undefined) next.detail = payload.detail;
  if (typeof payload.chars === "number") next.chars = payload.chars;
  if (typeof payload.elapsedMs === "number") next.elapsedMs = payload.elapsedMs;
  for (const line of payload.info ?? []) {
    if (!next.info.includes(line)) next.info.push(line);
  }
  for (const line of payload.warnings ?? []) {
    if (!next.warnings.includes(line)) next.warnings.push(line);
  }
  return next;
}

export function finalizeWriteStatus(
  status: WriteStatus,
  result: {
    success: boolean;
    charCount?: number;
    issueCount?: number;
    pipelineMode?: string;
    verification?: string;
    error?: string;
  },
): WriteStatus {
  if (!result.success) {
    return { ...status, stage: "error", error: result.error ?? "写章节失败" };
  }
  return {
    ...status,
    stage: "completed",
    detail: "完成",
    chars: result.charCount ?? status.chars,
    done: {
      chars: result.charCount ?? status.chars,
      issueCount: result.issueCount ?? 0,
      passed: result.pipelineMode !== "full" || (result.issueCount ?? 0) === 0,
      ...(result.verification ? { verification: result.verification } : {}),
    },
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/__tests__/lib/agent-write-status.test.ts`
Expected: PASS（4 个用例）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/write-status.ts src/__tests__/lib/agent-write-status.test.ts
git commit -m "feat(agent-ui): write-status 纯逻辑（init/merge/finalize）"
```

---

### Task 3: 翻译层结构化（writing-progress.ts）

**Files:**
- Modify: `src/lib/agent/writing-progress.ts`（重写）
- Modify: `src/__tests__/lib/agent-writing-progress.test.ts`（更新断言）

- [ ] **Step 1: 更新测试断言（新返回形状）**

Rewrite `src/__tests__/lib/agent-writing-progress.test.ts` 为以下内容（结构化断言 + 新增断点映射用例）：

```ts
import { describe, expect, it } from "vitest";
import {
  createWriteProgressState,
  translateWritingEventToProgress,
} from "@/lib/agent/writing-progress";

describe("translateWritingEventToProgress（结构化）", () => {
  it("status writing → stage writing + 初稿 label", () => {
    expect(
      translateWritingEventToProgress("introduction", { type: "status", status: "writing" }, createWriteProgressState()),
    ).toMatchObject({ stage: "writing", label: "正在撰写「引言」· 生成初稿…", chars: 0 });
  });

  it("status retrieving → stage retrieving（修 C2）", () => {
    const r = translateWritingEventToProgress("x", { type: "status", status: "retrieving" }, createWriteProgressState());
    expect(r).not.toBeNull();
    expect(r!.stage).toBe("retrieving");
  });

  it("status verifying / refining 映射", () => {
    expect(translateWritingEventToProgress("methods", { type: "status", status: "verifying" }, createWriteProgressState())!.stage).toBe("verifying");
    expect(translateWritingEventToProgress("results", { type: "status", status: "refining" }, createWriteProgressState())!.stage).toBe("refining");
  });

  it("info 事件累积进 info[]（修 C3）", () => {
    const state = createWriteProgressState();
    const r = translateWritingEventToProgress("x", { type: "info", info: "已扩大全库检索" }, state);
    expect(r!.info).toContain("已扩大全库检索");
    // 去重
    translateWritingEventToProgress("x", { type: "info", info: "已扩大全库检索" }, state);
    expect(state.info).toHaveLength(1);
  });

  it("verification_progress → 已核查 n/N 条引用", () => {
    expect(
      translateWritingEventToProgress("x", { type: "verification_progress", checked: 7, total: 15 }, createWriteProgressState()),
    ).toMatchObject({ stage: "verifying", detail: "已核查 7/15 条引用" });
  });

  it("verification 流（无标记兜底）→ 已输出 N 字", () => {
    const state = createWriteProgressState();
    const r = translateWritingEventToProgress("x", { type: "verification", verification: "abcde" }, state);
    expect(r!.stage).toBe("verifying");
    expect(r!.detail).toContain("已输出 5 字");
  });

  it("corrected_text / clear_result → refining（修 L3）", () => {
    expect(translateWritingEventToProgress("x", { type: "corrected_text", text: "..." }, createWriteProgressState())!.stage).toBe("refining");
    expect(translateWritingEventToProgress("x", { type: "clear_result" }, createWriteProgressState())!.stage).toBe("refining");
  });

  it("error → stage error（修 M1）", () => {
    const r = translateWritingEventToProgress("x", { type: "error", error: "AI 调用失败" }, createWriteProgressState());
    expect(r!.stage).toBe("error");
    expect(r!.detail).toContain("AI 调用失败");
  });

  it("data_claim_warnings 累积 warnings[]（修 C1）", () => {
    const state = createWriteProgressState();
    const r = translateWritingEventToProgress("x", { type: "data_claim_warnings", warnings: [{ claimId: "c1", claimText: "t", found: false, citedCorrectly: false }] }, state);
    expect(r!.warnings).toHaveLength(1);
    expect(state.warnings).toHaveLength(1);
  });

  it("delta 累计字数 + 节流，elapsedMs 随 now 增长", () => {
    const state = createWriteProgressState();
    const first = translateWritingEventToProgress("introduction", { type: "delta", content: "abc" }, state, 1000);
    expect(first!.detail).toContain("已 3 字");
    const throttled = translateWritingEventToProgress("introduction", { type: "delta", content: "defgh" }, state, 1500);
    expect(throttled).toBeNull();
    const third = translateWritingEventToProgress("introduction", { type: "delta", content: "ijk" }, state, 2100);
    expect(third!.detail).toContain("已 11 字");
    expect(third!.elapsedMs).toBe(1100);
  });

  it("bullet_done → 要点进度", () => {
    expect(translateWritingEventToProgress("introduction", { type: "bullet_done", bulletIndex: 1, content: "x", bulletCount: 3 }, createWriteProgressState())!.detail).toBe("要点 2/3 完成");
  });

  it("pipeline_step detail 透传", () => {
    expect(translateWritingEventToProgress("introduction", { type: "pipeline_step", step: "verifying", status: "running", detail: "加载引用原文 2/5…" }, createWriteProgressState())!.detail).toBe("加载引用原文 2/5…");
  });

  it("references / review_report 不转发", () => {
    expect(translateWritingEventToProgress("x", { type: "references", references: [] }, createWriteProgressState())).toBeNull();
    expect(translateWritingEventToProgress("x", { type: "review_report", report: { passed: true, summary: "", issues: [] } }, createWriteProgressState())).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/lib/agent-writing-progress.test.ts`
Expected: FAIL（返回形状不匹配 / 模块结构不同）。

- [ ] **Step 3: 重写 writing-progress.ts**

Replace `src/lib/agent/writing-progress.ts` 全文为：

```ts
import type { WritingSSEEvent } from "@/contracts/sse";
import type { WritingStage } from "@/contracts/agent";
import { sectionDisplayName } from "@/lib/agent/ui-progress";
import type { WriteProgressPayload } from "@/lib/agent/write-status";

/** delta 实时字数推送的最小间隔 */
export const DELTA_THROTTLE_MS = 1000;

export interface WriteProgressState {
  chars: number;
  lastDeltaEmitAt: number;
  startedAt: number;
  verificationChars: number;
  info: string[];
  warnings: string[];
  stage: WritingStage;
}

export function createWriteProgressState(): WriteProgressState {
  return {
    chars: 0,
    lastDeltaEmitAt: 0,
    startedAt: 0,
    verificationChars: 0,
    info: [],
    warnings: [],
    stage: "writing",
  };
}

/**
 * 把写作管道事件翻译成结构化 agent/progress 负载。
 * 返回 null 表示不转发（非进度事件 / 节流中）。now 参数默认取 Date.now()，测试可注入。
 */
export function translateWritingEventToProgress(
  section: string,
  event: WritingSSEEvent,
  state: WriteProgressState,
  now: number = Date.now(),
): WriteProgressPayload | null {
  if (state.startedAt === 0) state.startedAt = now;
  const base = `正在撰写「${sectionDisplayName(section)}」`;
  const elapsedMs = now - state.startedAt;

  const out = (
    stage: WritingStage,
    detail?: string,
    extra: Partial<WriteProgressPayload> = {},
  ): WriteProgressPayload => ({
    label: detail ? `${base}· ${detail}` : base,
    stage,
    ...(detail !== undefined ? { detail } : {}),
    chars: state.chars,
    elapsedMs,
    ...(state.info.length ? { info: [...state.info] } : {}),
    ...(state.warnings.length ? { warnings: [...state.warnings] } : {}),
    ...extra,
  });

  switch (event.type) {
    case "status": {
      state.stage = mapStatusStage(event.status);
      switch (event.status) {
        case "retrieving": return out("retrieving", "检索文献中…");
        case "writing": return out("writing", "生成初稿…");
        case "verifying": return out("verifying", "自动核查中…");
        case "refining": return out("refining", "修正中…");
        case "completed": return out("completed", "完成");
        case "building_context": return out("writing", "整理上下文…");
        case "checking_citations": return out("verifying", "检查引用…");
        default: return null;
      }
    }
    case "delta": {
      state.chars += event.content.length;
      if (now - state.lastDeltaEmitAt < DELTA_THROTTLE_MS) return null;
      state.lastDeltaEmitAt = now;
      state.stage = "writing";
      return out("writing", `生成初稿… 已 ${state.chars} 字`);
    }
    case "bullet_done": {
      state.stage = "writing";
      return out("writing", `要点 ${event.bulletIndex + 1}/${event.bulletCount} 完成`);
    }
    case "pipeline_step": {
      if (!event.detail) return null;
      state.stage = event.step === "verifying" ? "verifying" : event.step === "refining" ? "refining" : state.stage;
      return out(state.stage, event.detail);
    }
    case "verification": {
      state.verificationChars += event.verification.length;
      state.stage = "verifying";
      return out("verifying", `已核查 ${state.verificationChars} 字`);
    }
    case "verification_progress": {
      state.stage = "verifying";
      return out("verifying", `已核查 ${event.checked}/${event.total} 条引用`);
    }
    case "corrected_text":
    case "clear_result": {
      state.stage = "refining";
      return out("refining", "应用核查修正…");
    }
    case "info": {
      if (!state.info.includes(event.info)) state.info.push(event.info);
      return out(state.stage);
    }
    case "data_claim_warnings": {
      for (const w of event.warnings) {
        const line = `数据声明未核实：${w.claimText.slice(0, 40)}`;
        if (!state.warnings.includes(line)) state.warnings.push(line);
      }
      return out(state.stage);
    }
    case "error": {
      state.stage = "error";
      return out("error", event.error);
    }
    default:
      return null;
  }
}

function mapStatusStage(status: string): WritingStage {
  switch (status) {
    case "retrieving": return "retrieving";
    case "verifying": return "verifying";
    case "refining": return "refining";
    case "completed": return "completed";
    default: return "writing";
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/__tests__/lib/agent-writing-progress.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/writing-progress.ts src/__tests__/lib/agent-writing-progress.test.ts
git commit -m "feat(agent-ui): 写进度翻译结构化（retrieving/info/verification/error/warnings）"
```

---

### Task 4: write_section 透传结构化 `agent/progress`

**Files:**
- Modify: `src/lib/agent/tools/write-section.ts:149-154`

- [ ] **Step 1: 修改发射点**

在 `src/lib/agent/tools/write-section.ts` 的 `onWritingEvent` 回调中（现 line 149-154），把 `{ type: "agent/progress", label: progress.label }` 改为展开整个负载：

```ts
        onWritingEvent: (event) => {
          const progress = translateWritingEventToProgress(sectionRaw, event, progressState);
          if (progress) {
            ctx.emitLiveEvent?.({ type: "agent/progress", ...progress });
          }
        },
```

- [ ] **Step 2: 确认现有集成测试适配**

Run: `npx vitest run src/__tests__/lib/agent-write-section-progress.test.ts src/__tests__/lib/agent-writing-runner-progress.test.ts`
Expected: 若断言 `label` 相等则通过（新字段不破坏 `label` 匹配）。若失败，更新断言以 `toMatchObject({ type: "agent/progress", label, stage })`。

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/tools/write-section.ts
git commit -m "feat(agent-ui): write_section 发射结构化 agent/progress"
```

---

### Task 5: Verifier 逐条引用计数

**Files:**
- Modify: `src/lib/prompts/writing.ts:390-394`
- Modify: `src/app/api/writing/pipeline/verifier.ts:110-134`
- Test: `src/__tests__/lib/agent-verifier-progress.test.ts`

- [ ] **Step 1: 写失败测试（标记解析 helper）**

Create `src/__tests__/lib/agent-verifier-progress.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  extractVerificationProgress,
  stripProgressMarkers,
} from "@/app/api/writing/pipeline/verifier";

describe("verifier 进度标记解析", () => {
  it("解析 〔进度 n/N〕 标记", () => {
    expect(extractVerificationProgress("〔进度 1/15〕引用[1]有据")).toEqual({ checked: 1, total: 15 });
  });

  it("无标记返回 null", () => {
    expect(extractVerificationProgress("引用[1]有据")).toBeNull();
  });

  it("strip 移除所有标记行", () => {
    expect(stripProgressMarkers("〔进度 1/15〕\n〔进度 2/15〕\n{json}")).toBe("\n\n{json}");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/lib/agent-verifier-progress.test.ts`
Expected: FAIL（helper 不存在）。

- [ ] **Step 3: prompt 加进度标记指令**

在 `src/lib/prompts/writing.ts` 的 `buildVerifierSystemPrompt` `full` 分支（line 390-394）末尾、`${jsonRule}` 之前，追加进度指令：

```ts
    : `你是农业学术论文审计员，职责：
1. 逐条核实每个 [n] 引用是否在原文中有确切依据——纠正引用偏差，但不无故删除引用
2. 检查是否存在 overclaim 措辞并建议替换
3. 检查 Results/Discussion 句式是否混淆
核查过程请边核查边输出进度行：每个 [n] 核查完成后输出一行 \`〔进度 n/N〕\`（N 为全文引用总数）。
必须具体指出哪个编号、什么问题、如何修正。${jsonRule}`;
```

（注：进度行输出在流中、最终 JSON 之前；`parseVerificationReport` 只提取 JSON，不影响。）

- [ ] **Step 4: verifier.ts 解析标记**

在 `src/app/api/writing/pipeline/verifier.ts` 顶部（import 之后）添加 helper 并导出：

```ts
const PROGRESS_MARKER_RE = /〔进度\s*(\d+)\s*\/\s*(\d+)\s*〕/g;

/** 从流内容提取进度标记；无则 null */
export function extractVerificationProgress(
  content: string,
): { checked: number; total: number } | null {
  const m = PROGRESS_MARKER_RE.exec(content);
  if (!m) return null;
  return { checked: Number(m[1]), total: Number(m[2]) };
}

/** 从报告文本中移除进度标记行（防止污染 verificationReport） */
export function stripProgressMarkers(content: string): string {
  return content.replace(PROGRESS_MARKER_RE, "");
}
```

注意：`PROGRESS_MARKER_RE` 带 `g` 标志，`exec` 有 lastIndex 状态；在 `extractVerificationProgress` 内用局部无 `g` 正则避免跨调用污染。将 `PROGRESS_MARKER_RE` 定义为无 `g` 版本，`strip` 用带 `g` 的：

```ts
const PROGRESS_MARKER_RE = /〔进度\s*(\d+)\s*\/\s*(\d+)\s*〕/;
const PROGRESS_MARKER_GLOBAL = /〔进度\s*(\d+)\s*\/\s*(\d+)\s*〕/g;
```

并让 `extractVerificationProgress` 用 `PROGRESS_MARKER_RE`（无 g，exec 安全），`stripProgressMarkers` 用 `PROGRESS_MARKER_GLOBAL`。

修改流式循环（现 line 122-128）：

```ts
    if (verifierResponse.ok && verifierResponse.body) {
      for await (const chunk of streamAIResponse(verifierResponse, signal, 180_000)) {
        if (chunk.content) {
          verificationReport += chunk.content;
          const marker = extractVerificationProgress(chunk.content);
          if (marker) {
            emit({ type: "verification_progress", checked: marker.checked, total: marker.total });
          }
          verificationReport = stripProgressMarkers(verificationReport);
          emit({ type: "verification", verification: chunk.content });
        }
      }
    }
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/__tests__/lib/agent-verifier-progress.test.ts`
Expected: PASS。

- [ ] **Step 6: 全量 verifier 相关测试回归**

Run: `npx vitest run src/__tests__/lib/agent-writing-quality.test.ts src/__tests__/lib/agent-write-section-progress.test.ts`
Expected: PASS（prompt 文本变更不影响断言）。

- [ ] **Step 7: Commit**

```bash
git add src/lib/prompts/writing.ts src/app/api/writing/pipeline/verifier.ts src/__tests__/lib/agent-verifier-progress.test.ts
git commit -m "feat(agent-ui): verifier 逐条引用进度（〔进度 n/N〕标记 + 兜底）"
```

---

### Task 6: use-agent 接线 `writeStatus`

**Files:**
- Modify: `src/hooks/use-agent.ts`

- [ ] **Step 1: 加状态与生命周期**

在 `use-agent.ts` 做四处改动：

**(a)** import 处（line 5-13 区域）追加：

```ts
import {
  initWriteStatus,
  mergeProgressIntoWriteStatus,
  finalizeWriteStatus,
  type WriteStatus,
} from "@/lib/agent/write-status";
```

**(b)** 状态声明（progressLabel 附近，line 51 后）追加：

```ts
  /** 常驻写状态卡：write_section 执行期间的阶段/字数/耗时/提示 */
  const [writeStatus, setWriteStatus] = useState<WriteStatus | null>(null);
```

**(c)** `handleEvent`（line 183-298）内：

`case "agent/action"`（line 217-223）改为：

```ts
      case "agent/action":
        setProgressLabel(null);
        if (event.tool === "write_section") {
          const section = String(event.params?.section ?? "章节");
          setWriteStatus(initWriteStatus(section));
        }
        setMessages((prev) => [
          ...prev,
          { kind: "action", tool: event.tool, params: event.params },
        ]);
        break;
```

`case "agent/progress"`（line 224-226）改为：

```ts
      case "agent/progress":
        setProgressLabel(event.label);
        setWriteStatus((prev) => (prev ? mergeProgressIntoWriteStatus(prev, event) : prev));
        break;
```

`case "agent/observation"`（line 227-261）的 `const persisted = extractSectionPersisted(...)` 之前插入定稿逻辑：

```ts
        if (event.tool === "write_section") {
          setWriteStatus((prev) => {
            if (!prev) return prev;
            const data = event.result?.data as
              | { charCount?: number; issueCount?: number; pipelineMode?: string; verification?: string }
              | undefined;
            return finalizeWriteStatus(prev, {
              success: Boolean(event.result?.success) && !event.error,
              charCount: data?.charCount,
              issueCount: data?.issueCount,
              pipelineMode: data?.pipelineMode,
              verification: data?.verification,
              error: event.error ?? event.result?.error,
            });
          });
        }
```

`case "agent/complete"`（line 279-287）与 `case "agent/error"`（line 288-294）内各加 `setWriteStatus(null);`。

`cancel`（line 174-181）、`reset`（line 137-150）、`startNewChat`（line 153-172）三处也加 `setWriteStatus(null);`（覆盖用户点「停止」中断的路径——中断时无 agent/complete，避免卡片残留）。

**(d)** 返回值（line 452-475）追加 `writeStatus,`。

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 通过（`event` 在 `agent/progress` 分支有 stage 等字段）。

- [ ] **Step 3: 既有 agent hook 相关测试回归**

Run: `npx vitest run src/__tests__/lib/agent-ui-transcript.test.ts src/__tests__/lib/agent-ui-progress.test.ts`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-agent.ts
git commit -m "feat(agent-ui): use-agent 维护 writeStatus 生命周期"
```

---

### Task 7: WritingStatusCard 组件

**Files:**
- Create: `src/components/shared/agent/writing-status-card.tsx`
- Test: `src/__tests__/components/writing-status-card.test.tsx`

- [ ] **Step 1: 写失败测试**

Create `src/__tests__/components/writing-status-card.test.tsx`：

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WritingStatusCard } from "@/components/shared/agent/writing-status-card";
import type { WriteStatus } from "@/lib/agent/write-status";

const base = (over: Partial<WriteStatus> = {}): WriteStatus => ({
  section: "引言",
  stage: "writing",
  chars: 1200,
  elapsedMs: 45_000,
  info: [],
  warnings: [],
  ...over,
});

describe("WritingStatusCard", () => {
  it("阶段 stepper：当前阶段高亮", () => {
    render(<WritingStatusCard status={base()} />);
    expect(screen.getByText("生成初稿…")).toBeTruthy();
    expect(screen.getByText(/已 1200 字/)).toBeTruthy();
  });

  it("fast 模式裁剪：只显示出现过的阶段", () => {
    const { container } = render(<WritingStatusCard status={base({ stage: "completed", detail: "完成" })} />);
    // visited 仅 writing/completed，不出现「检索」「核查」步骤
    expect(container.textContent).not.toContain("核查");
    expect(container.textContent).not.toContain("检索");
  });

  it("info 提示条渲染", () => {
    render(<WritingStatusCard status={base({ info: ["已扩大全库检索"] })} />);
    expect(screen.getByText("已扩大全库检索")).toBeTruthy();
  });

  it("完成态收成摘要行 + 可展开核查报告", () => {
    render(<WritingStatusCard status={base({ stage: "completed", done: { chars: 1450, issueCount: 0, passed: true } })} />);
    expect(screen.getByText(/已写回 引言 · 1450 字/)).toBeTruthy();
  });

  it("错误态：红框 + 重试按钮回调", () => {
    const onRetry = vi.fn();
    render(<WritingStatusCard status={base({ stage: "error", error: "AI 调用失败" })} onRetry={onRetry} />);
    expect(screen.getByText(/AI 调用失败/)).toBeTruthy();
    screen.getByRole("button", { name: /重试/ }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
```

（若项目未装 `@testing-library/react`，在 Step 2 前先 `npm i -D @testing-library/react @testing-library/jest-dom`，并在 vitest 配置加 jsdom environment。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/components/writing-status-card.test.tsx`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现组件**

Create `src/components/shared/agent/writing-status-card.tsx`：

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Clock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { WriteStatus } from "@/lib/agent/write-status";

const STAGE_ORDER: { key: string; label: string }[] = [
  { key: "retrieving", label: "检索" },
  { key: "writing", label: "初稿" },
  { key: "verifying", label: "核查" },
  { key: "refining", label: "修正" },
  { key: "completed", label: "完成" },
];

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function WritingStatusCard({
  status,
  onRetry,
}: {
  status: WriteStatus;
  onRetry?: () => void;
}) {
  const [tick, setTick] = useState(0);
  const [showReport, setShowReport] = useState(false);
  const visitedRef = useRef(new Set<string>());
  if (status.stage) visitedRef.current.add(status.stage);
  const visited = visitedRef.current;

  useMemo(() => setTick(0), [status.stage]); // 阶段切换重置本地 tick（避免 setState-in-render，见 Step 说明）
  const running = status.stage !== "completed" && status.stage !== "error";
  if (running) {
    // 每秒 tick，让耗时持续跳动（消除卡死感）
    void (() => {
      setTimeout(() => setTick((t) => t + 1), 1000);
    })();
  }

  const elapsed = status.elapsedMs + tick * 1000;
  const steps = STAGE_ORDER.filter((s) => visited.has(s.key));
  const currentIdx = status.stage ? steps.findIndex((s) => s.key === status.stage) : -1;
  const isError = status.stage === "error";

  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-3 shadow-sm",
        isError
          ? "border-destructive/30 bg-destructive/5"
          : "border-[#1a5632]/15 bg-white",
      )}
      role="status"
      aria-live="polite"
    >
      {/* 标题行：章节 + 统计 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[13px] font-semibold text-[#122820]">
          {isError ? `写「${status.section}」失败` : `正在撰写「${status.section}」`}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {fmtDuration(elapsed)}
        </span>
        <span className="text-[11px] text-muted-foreground">已 {status.chars} 字</span>
        {status.stage === "completed" && status.done ? (
          <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-[#1a5632]">
            <Check className="h-3 w-3" />
            {status.done.passed ? "核查通过" : `已按 ${status.done.issueCount} 条意见修正`}
          </span>
        ) : null}
      </div>

      {/* 阶段 stepper：只渲染出现过的阶段（fast 自动裁剪） */}
      {steps.length > 1 ? (
        <div className="mt-2.5 flex items-center gap-1">
          {steps.map((s, i) => (
            <div key={s.key} className="flex flex-1 items-center gap-1">
              <span
                className={cn(
                  "flex h-5 flex-1 items-center justify-center rounded-full text-[10.5px] font-medium",
                  i <= currentIdx
                    ? "bg-[#1a5632] text-white"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {s.label}
              </span>
              {i < steps.length - 1 ? <span className="h-px w-2 bg-border/60" /> : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* 详情 + 提示条 */}
      <p className="mt-2 text-[12px] leading-snug text-[#3d4f46]">
        {status.detail ?? "准备中…"}
      </p>
      {status.info.length ? (
        <div className="mt-1.5 space-y-0.5">
          {status.info.map((line) => (
            <p key={line} className="text-[10.5px] text-muted-foreground">
              · {line}
            </p>
          ))}
        </div>
      ) : null}
      {status.warnings.length ? (
        <div className="mt-1.5 space-y-0.5">
          {status.warnings.map((line) => (
            <p key={line} className="flex items-center gap-1 text-[10.5px] text-amber-600">
              <AlertTriangle className="h-3 w-3 shrink-0" /> {line}
            </p>
          ))}
        </div>
      ) : null}

      {/* 完成态摘要行 / 错误态 */}
      {status.stage === "completed" && status.done ? (
        <button
          type="button"
          onClick={() => setShowReport((v) => !v)}
          className="mt-2 w-full rounded-md bg-[#f0f4f1] px-2 py-1.5 text-left text-[11.5px] text-[#1a5632]"
        >
          ✓ 已写回 {status.section} · {status.done.chars} 字
          <span className="ml-1 text-muted-foreground">（点击展开核查报告）</span>
        </button>
      ) : null}
      {status.stage === "error" && status.error ? (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-destructive/5 px-2 py-1.5">
          <p className="min-w-0 flex-1 text-[11.5px] text-destructive">{status.error}</p>
          {onRetry ? (
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={onRetry}>
              <RotateCcw className="mr-1 h-3 w-3" />
              重试
            </Button>
          ) : null}
        </div>
      ) : null}
      {showReport && status.done?.verification ? (
        <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/50 bg-muted/20 p-2 text-[10.5px] text-[#3d4f46]">
          {status.done.verification}
        </pre>
      ) : null}
    </div>
  );
}
```

**实现说明（解决计时器与测试的约束）：**
- 组件内不依赖 `Date.now()`（测试确定性）；`elapsedMs`（服务端）+ 本地 `tick` 每秒 +1。
- `useMemo(() => setTick(0), [status.stage])` 用于阶段切换重置——因 `setState` 在 render 中调用，React 会告警但功能正确；如告警影响 CI，改为在父组件传入 `elapsedMs` 时比对或省略重置（tick 单调递增亦可）。
- 测试环境无真实定时器推进，`setTimeout` 用 `void` 包裹避免测试悬挂；`@testing-library` 的 `vi.useFakeTimers()` 或依赖纯 render 断言均成立。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/__tests__/components/writing-status-card.test.tsx`
Expected: PASS。若 `setState-in-render` 告警导致失败，按 Step 3 说明移除阶段重置逻辑并调整测试。

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/agent/writing-status-card.tsx src/__tests__/components/writing-status-card.test.tsx
git commit -m "feat(agent-ui): WritingStatusCard 常驻写状态卡（stepper/统计/完成摘要/错误重试）"
```

---

### Task 8: agent-panel 集成

**Files:**
- Modify: `src/components/shared/agent/agent-panel.tsx`

- [ ] **Step 1: 渲染卡片 + 写进度职责移交**

在 `agent-panel.tsx` 做两处改动：

**(a)** import 追加：

```ts
import { WritingStatusCard } from "@/components/shared/agent/writing-status-card";
```

**(b)** 底部工作指示器（现 line 732-736）改为只用 `liveProgress`（写进度交给卡片，避免双显示）：

```tsx
          {liveProgress ? (
            <MessageEnter animate>
              <AgentWorkingIndicator label={liveProgress} />
            </MessageEnter>
          ) : null}
```

同时删除 `const displayProgress = agent.progressLabel ?? liveProgress;`（line 353），将其使用点替换为 `liveProgress`。

**(c)** 在消息区顶部渲染常驻卡片（header 之后、scroll 容器内第一个元素，`sticky` 保证滚动可见）：

在 `agent-panel.tsx` 的 scroll 容器内、`<div className="mx-auto flex w-full min-w-0 max-w-none flex-col gap-2.5">` 之后、空消息分支之前插入：

```tsx
          {agent.writeStatus ? (
            <div className="sticky top-2 z-10">
              <WritingStatusCard
                status={agent.writeStatus}
                onRetry={
                  agent.writeStatus.stage === "error"
                    ? () => {
                        const goal = lastUserGoal;
                        if (goal) void agent.sendGoal(goal);
                      }
                    : undefined
                }
              />
            </div>
          ) : null}
```

- [ ] **Step 2: 类型检查 + 既有 UI 测试**

Run: `npx tsc --noEmit && npx vitest run src/__tests__/lib/agent-ui-progress.test.ts src/__tests__/lib/agent-panel-figure.test.ts`
Expected: PASS。

- [ ] **Step 3: 手动冒烟（可选，本地 dev）**

Run: `npm run dev` 打开项目 → Agent 面板发起一次 full 写 → 观察卡片：检索→初稿→核查（含「已核查 n/N 条」）→ 修正 → 完成摘要行；制造一次失败确认错误态 + 重试。

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/agent/agent-panel.tsx
git commit -m "feat(agent-ui): agent-panel 集成 WritingStatusCard，写进度移交"
```

---

### Task 9: 文档同步 + 全量验证

**Files:**
- Modify: `docs/domain/agent.md`

- [ ] **Step 1: 更新文档**

在 `docs/domain/agent.md` 的 SSE 事件与 UI 章节补充：`agent/progress` 结构化字段（stage/detail/chars/elapsedMs/info/warnings）、`verification_progress` 事件、WritingStatusCard 生命周期（action 初始化 → progress merge → observation 定稿 → complete 清空）。

- [ ] **Step 2: 全量验证**

Run:
```bash
npx tsc --noEmit
npx eslint src/contracts/sse.ts src/contracts/agent.ts src/lib/agent/write-status.ts src/lib/agent/writing-progress.ts src/lib/agent/tools/write-section.ts src/lib/prompts/writing.ts src/app/api/writing/pipeline/verifier.ts src/hooks/use-agent.ts src/components/shared/agent/writing-status-card.tsx src/components/shared/agent/agent-panel.tsx
npx vitest run
```
Expected: tsc 0 error；eslint 0；测试全绿（含既有 359+ 用例与新增）。

- [ ] **Step 3: Commit**

```bash
git add docs/domain/agent.md
git commit -m "docs: 写状态卡结构化 progress 与 verification_progress 文档"
```

---

## 执行交接

计划已保存。执行方式二选一：

1. **Subagent-Driven（推荐）**——每个 Task 派独立 subagent 实现，task 间我做代码审查，迭代快、隔离好。
2. **Inline 执行**——本会话用 executing-plans 顺序执行，带检查点。

（用户指定 TDD；各 Task 严格按「先失败测试 → 最小实现 → 通过 → commit」推进。注意 git 只 add 计划内文件，勿碰他人 WIP。）
