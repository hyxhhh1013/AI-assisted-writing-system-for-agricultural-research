# Agent 编排（写作助手）

> L3 域文档 · 更新：2026-08-06
> 契约唯一权威源：`src/contracts/agent.ts`（SSE 事件）、`src/contracts/agent-session.ts`（会话消息）。

## 概览

Agent 写作助手基于 LangGraph 编排：LLM 决定调用工具，工具执行写回项目，结果回喂 LLM，循环直到完成。入口 `POST /api/agent`。

```text
客户端 → POST /api/agent (SSE) → runAgentGraphLoop (AsyncGenerator)
        → graph.stream(initialState, {configurable:{agentRuntime}}) → toolsNode
        → 工具 execute(params, agentContext) → 写库 / 调 AI / 回观察
        → mergeGraphAndLive(快照事件 + 实时事件) → SSE → 前端 use-agent
```

## 关键文件

| 文件 | 职责 |
|------|------|
| `src/lib/agent/index.ts` | `runAgentLoop` 公共出口（re-export；实际包装在 `core/agent-loop.ts`） |
| `src/lib/agent/langgraph/run-graph.ts` | 图循环：状态初始化、`LiveEventQueue`、实时/快照合并、落库 |
| `src/lib/agent/langgraph/nodes.ts` | `toolsNode` 工具执行 + 门禁 + 并行快路径；`agentNode` LLM 调用 |
| `src/lib/agent/langgraph/parallel-tools.ts` | 只读工具批量并行（`PARALLEL_READ_TOOLS` 白名单） |
| `src/lib/agent/langgraph/graph.ts` | 编译 LangGraph |
| `src/lib/agent/tools/*.ts` | 各工具定义（`ToolDefinition`） |
| `src/lib/agent/writing-progress.ts` | 写节进度翻译层（管道事件 → `agent/progress` label） |
| `src/lib/agent/writing-runner.ts` | 复用写作管道；`onWritingEvent` 转发进度 |
| `src/lib/agent/session-store.ts` | 会话持久化 + `tryAcquireAgentSession` 并发互斥 |
| `src/hooks/use-agent.ts` / `components/shared/agent/agent-panel.tsx` | 前端状态机与面板 |
| `src/app/api/agent/route.ts` | SSE 路由（认证、会话抢占、流式输出） |

## SSE 事件表（`contracts/agent.ts`）

| 事件 | 说明 | 实时/快照 |
|------|------|-----------|
| `agent/status` | 状态机：planning/thinking/executing/finalizing/awaiting_checkpoint/completed/error/cancelled | 快照 |
| `agent/plan` | Plan 子任务列表 + 焦点 | 快照 |
| `agent/thought` | 完整思考（终） | 快照 |
| `agent/thought_delta` | LLM 回复逐 token 增量 | **实时**（不持久化） |
| `agent/action` | 工具被调用（params） | 快照 |
| `agent/observation` | 工具结果（result/error） | 快照 |
| `agent/progress` | **长工具执行期实时进度文案**（服务端拼好含章节名，`label` 直接显示） | **实时**（不持久化） |
| `agent/confirm` | 写操作需用户确认（import_reference 等） | 快照 |
| `agent/checkpoint` | S2 检查点（config_confirm / outline_approve / clarify） | 快照 |
| `agent/complete` | 完成摘要 `AgentSummary` | 快照 |
| `agent/error` | 错误 | 快照 |
| `agent/session` | 会话 id + 状态（running/interrupted/completed/error） | 快照 |

**实时 vs 快照**：快照事件随 graph 状态逐次产出并持久化进 `uiTranscript`；实时事件（`thought_delta`、`progress`）经 `LiveEventQueue` 即时推送，**不持久化、不进 uiTranscript、续跑不回放**。合并逻辑 `mergeGraphAndLive` 保证实时事件不被阻塞、graph 结束时排空缓冲。

## write_section 进度透传链路（2026-08-06 新增）

Agent 调 `write_section`（fast/full 双模式）时，写作管道内部本已发射 `status`/`pipeline_step`/`delta` 等进度事件，但原被 `writing-runner.ts` 收进本地数组丢弃，用户等待 1-3 分钟只见静态「正在撰写…」。

链路：

```text
runWritingPipeline emit(status/pipeline_step/delta/bullet_done)
  → runAgentWriteSection.onWritingEvent（writing-runner.ts）
  → translateWritingEventToProgress（writing-progress.ts，delta 1000ms 节流累计字数）
  → ctx.emitLiveEvent({ type:"agent/progress", label })
  → LiveEventQueue → mergeGraphAndLive → SSE → use-agent setProgressLabel
  → agent-panel 工作指示器（progressLabel ?? resolveLiveProgress 回退）
```

- 事件契约：`{ type: "agent/progress"; label: string }`，label 服务端拼好（`正在撰写「引言」· 生成初稿… 已 860 字`）。
- 前端 `progressLabel` 在 `agent/action` 换工具、`agent/complete`、`agent/error`、`cancel`/`reset`、切项目、`runStream` 起始时清空，防残留。
- `ctx.emitLiveEvent` 为可选字段；图循环在 `runAgentGraphLoop` 初始化时从 `runtime.emitLiveEvent` 注入（`run-graph.ts`）。

## 会话并发互斥

`tryAcquireAgentSession` 用 Postgres `updateMany` 原子抢占（仅 `status ∈ fromStatuses` 时置 running）。resume（interrupted/error）与跟聊（completed/interrupted/error）路径都走原子抢占；冲突 → HTTP 409「会话仍在执行中」，防止同一会话并发跑图、快照互相覆盖。`reclaimStaleRunningSessions` 回收进程退出遗留的僵尸 running。

## 常用命令

- Agent 端到端剧本：`npm run eval:agent`（`src/lib/eval/agent-scripts.ts`，P1~P6 + FILE-READ 断言）
- 全量测试：`npx vitest run`（Agent 相关测试在 `src/__tests__/lib/agent-*.test.ts`、`src/__tests__/api/agent-*.test.ts`）
- 测试注意：Agent 接口用 `x-user-id` header 会 401（proxy 需 session cookie）；测试方式是 JWT_SECRET 签 token 作 cookie，或用真实域名登录。
