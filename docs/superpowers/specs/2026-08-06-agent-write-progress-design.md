# Agent write_section 进度透传设计

- **日期**：2026-08-06
- **分支**：eng/wave3-academic-align
- **状态**：已批准（2026-08-06）
- **背景**：P1 队列首项 —— full 模式 write_section 写节 1-3 分钟用户看不到任何进度，UX 价值最高

## 1. 问题

Agent 调用 `write_section`（`pipelineMode: full`）时，`runAgentWriteSection` → `runWritingPipeline` 内部运行 Writer → Verifier → Refiner → Finalize 四阶段，耗时 1-3 分钟。

写作管道**本身已经发射** `status`（writing/verifying/refining）与 `pipeline_step`（running/done + 中文 detail，如「初稿 2400 字」「扩写要点 2/5」）等进度事件，但 `writing-runner.ts` 的 `emit` 把这些事件收进本地 `events[]` 数组后即丢弃——只取最终结果。前端全程只看到静态的「正在撰写「引言」…」。

实时通道已存在：`runAgentGraphLoop` 通过 `runtime.emitLiveEvent` → `LiveEventQueue` → `mergeGraphAndLive` → SSE → 前端 `handleEvent`。但工具执行路径（`ctx: AgentContext`）没有接入该通道。

## 2. 目标与非目标

### 目标
- 写节等待期间，前端能实时看到阶段 + 细节文字（含实时字数）
- 覆盖 write_section 的 **fast 与 full 双模式**（同一管道，同一套事件）
- 保持 agent 契约干净，通道可复用

### 非目标
- 其他长工具（refine_content 等）的进度透传——后续按需接入同一通道
- 进度持久化/续跑回放——与 `agent/thought_delta` 一致，live-only
- 视觉步骤条等新 UI 组件

## 3. 设计

### 3.1 事件契约

`contracts/agent.ts` 的 `AgentSSEEvent` 联合类型新增：

```ts
| { type: "agent/progress"; label: string }
```

- `label`：**服务端拼好的完整展示文案**（含章节名，经 `sectionDisplayName`），前端拿到直接显示，不做拼装
- 只作实时推送，不持久化、不进 `uiTranscript`
- `isAgentSSEEvent` 已按 `agent/` 前缀守卫，天然兼容

### 3.2 实时通道接入

`lib/agent/types.ts` 的 `AgentContext` 新增可选字段：

```ts
emitLiveEvent?: (event: AgentSSEEvent) => void
```

`langgraph/run-graph.ts` 调整：

1. 把 `LiveEventQueue` 的创建从第 433 行提前到 `runtime` 定义处（约第 101 行），同时赋 `runtime.emitLiveEvent`
2. 紧跟赋值 `context.emitLiveEvent = runtime.emitLiveEvent`（`runtime.agentContext` 与 `context` 是同一引用，直接改即可）
3. 原第 433-434 行删除

这样 confirm 路径（图外直接执行工具）与 graph 内 toolsNode 路径都能拿到通道。`write_section` 非 confirm 工具，但提前创建无害且语义更完整。

### 3.3 翻译层

`writing-runner.ts`：`runAgentWriteSection` 新增可选参数：

```ts
onWritingEvent?: (event: WritingSSEEvent) => void
```

内部 `emit`（现第 175-180 行）在 push 进 `events[]` 的同时调用 `onWritingEvent(event)`。

新增文件 `lib/agent/writing-progress.ts`，纯函数翻译：

```ts
export function translateWritingEventToProgress(
  section: string,
  event: WritingSSEEvent,
  state: { chars: number; lastDeltaEmitAt: number },
): { label: string } | null
```

| 管道事件 | → agent/progress label |
|---|---|
| `status: "writing"` | 正在撰写「{section}」· 生成初稿… |
| `delta` | 生成初稿… 已 {累计字数} 字（**≥1000ms 节流**，累积更新 state.chars） |
| `pipeline_step` (step=writing, done) | 初稿 {detail 字数} 字 |
| `status: "verifying"` | 正在撰写「{section}」· 自动核查中… |
| `status: "refining"` | 正在撰写「{section}」· 修正中… |
| `bullet_done` | 要点 {i+1}/{n} 完成 |
| 其余（error / verification / references / corrected_text 等） | null（不转发） |

`write-section.ts` 组装：`execute` 内构造 throttler 状态，`onWritingEvent` 回调中调用翻译函数，返回非 null 时 `ctx.emitLiveEvent?.({ type: "agent/progress", label })`。

`delta` 节流：每工具调用一个 `lastDeltaEmitAt` 状态，两次推送间隔 ≥1000ms；stage 切换（收到 `status: verifying`）时 flush 最终字数。

### 3.4 前端

`hooks/use-agent.ts`：

- 新增 state `progressLabel: string | null`（或并入现有状态对象）
- `handleEvent` 加分支：`case "agent/progress": setProgressLabel(event.label)`；`agent/status` 收到终态（completed/error/cancelled）或 `agent/action` 换工具时清空

`components/shared/agent/agent-panel.tsx`：

- 工作指示器渲染处（现第 761-765 行）：`agent.progressLabel` 存在时直接显示，否则回退现有 `resolveLiveProgress`
- `resolveLiveProgress` / `formatToolWorkingLine` 逻辑不变

### 3.5 错误与边界

- **取消**：`ctx.signal` 中止已正确传播到写作管道（`runAgentWriteSection` 用内部 `Request(signal)` 接入），进度只是停止推送，前端走现有 cancelled 状态
- **`emitLiveEvent` 未定义**（测试直调工具等场景）：翻译层 no-op，行为与现状完全一致
- **不持久化**：续跑/刷新后不回放进度

## 4. 测试

| 层 | 内容 |
|---|---|
| 翻译层单测（新） | `writing-progress.test.ts`：status / pipeline_step / bullet_done / delta 节流 → 正确 label；非转发事件 → null |
| 转发测试（新） | `writing-runner.test.ts`：传 `onWritingEvent`，断言管道事件确实透出 |
| 工具集成测试（新/扩） | mock `ctx.emitLiveEvent`，跑一次 full 模式，断言收到 `agent/progress` 且顺序正确 |
| 既有测试 | `agent-ui-progress.test.ts` 保持通过（resolveLiveProgress 逻辑不动） |

## 5. 改动文件清单

- `src/contracts/agent.ts`（新事件类型）
- `src/lib/agent/types.ts`（AgentContext.emitLiveEvent）
- `src/lib/agent/langgraph/run-graph.ts`（LiveEventQueue 提前 + 赋值）
- `src/lib/agent/writing-runner.ts`（onWritingEvent 参数）
- `src/lib/agent/tools/write-section.ts`（翻译接线）
- `src/lib/agent/writing-progress.ts`（新增翻译纯函数）
- `src/hooks/use-agent.ts`（progress 状态）
- `src/components/shared/agent/agent-panel.tsx`（指示器显示）
- 对应测试文件
