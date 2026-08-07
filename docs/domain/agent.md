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

## 模型角色

`AgentRole = writer | verifier | refiner | planner`（`src/lib/models.ts`），可在 Admin 设置页分别配置 provider（DeepSeek/智谱），存 DB `AGENT_ROLE_*` 键、启动时热加载。

- **writer**：Agent 主推理循环 + 写作管道主模型（默认 DeepSeek）
- **verifier**：一致性 / 引用审查（默认智谱，若启用）
- **refiner**：写作后润色（默认 DeepSeek）
- **planner**：规划步骤生成子任务列表（默认智谱，若启用；未配置回落 DeepSeek）。规划是短任务，走便宜模型省成本
- 调用侧：`callAINonStreamingWithTools` / `callAIStreamingWithTools` 接受 `role` 参数（默认 writer），`planner.ts` 传 `role: "planner"`

## 关键文件

| 文件 | 职责 |
|------|------|
| `src/lib/agent/index.ts` | `runAgentLoop` 公共出口（re-export；实际包装在 `core/agent-loop.ts`） |
| `src/lib/agent/langgraph/run-graph.ts` | 图循环：状态初始化、`LiveEventQueue`、实时/快照合并、落库 |
| `src/lib/agent/langgraph/nodes.ts` | `toolsNode` 工具执行 + 门禁 + 并行快路径；`agentNode` LLM 调用 |
| `src/lib/agent/langgraph/parallel-tools.ts` | 只读工具批量并行（`PARALLEL_READ_TOOLS` 白名单） |
| `src/lib/agent/langgraph/tool-gates.ts` | toolsNode 门禁中间件：前置链（重复/配额/意图+先读后写）+ 阶段 + 后置链（antispam/clarify/outline） |
| `src/lib/agent/langgraph/graph.ts` | 编译 LangGraph |
| `src/lib/agent/tools/*.ts` | 各工具定义（`ToolDefinition`） |
| `src/lib/agent/writing-progress.ts` | 写节进度翻译层（管道事件 → `agent/progress` label） |
| `src/lib/agent/writing-quality.ts` | WQC 写作质检轻量：喉清开场 / 综上所述堆砌 / overclaim / 段长方差（确定性规则，warn 级不阻断） |
| `src/lib/agent/quality-closure.ts` | 质量收口看板数据层：聚合节完整度/摘要/引用硬检/审查 4 信号（纯函数） |
| `components/shared/agent/quality-closure-panel.tsx` | 质量收口看板 UI（工作台 agent Tab 顶部） |
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

## 引用核查 / 引用修正意图门禁（2026-08-07 修正）

`goal-intents.ts` 负责把用户 goal + 会话 observations 解析成「引用核查/修正」意图，并驱动 `checkCitationSideTripGate` 拦截检索、导入、写摘要、**写其它章节**等旁路。判定的关键信号是 `validate_citations` 的成功记录——但该工具同时被两条路径触发：**用户主动要求引用核查**，以及 **`reflect.ts` 写完章节后的例行动作自查**。旧实现只看「是否成功跑过 validate」就判定进入引用修正模式，导致：

- **跟聊误判**：写完自查通过（0 问题）后，用户回「好/继续」，`isCitationApplyGoal` 误当「同意引用修正」→ `checkCitationSideTripGate` 拦下后续 `write_section`（「当前是引用核查/修正任务…」）。
- **AP 流程起草被顶**：`resolveApPipelineStep` 只要 validate 成功就返回 `citation_fix`，正在起草其它章节的 `write_section` 被误拦。

**修正（2026-08-07）**：进入「引用修正」意图/阶段必须满足**最近一次 validate 报告确实发现待修问题**（硬检未过 `exportReady/phase5Passed`，或语义可疑 `grounding.suspiciousCount > 0`；判定复用 `reflect.ts` 导出的 `validateIssueCount`）。写完自查的干净报告（0 问题）不再把会话顶进修正模式，后续 `write_section` 正常放行。覆盖链路：跟聊短确认、AP 流程 `citation_fix` 阶段、并行只读批门禁（`parallel-tools.ts` 同源）。

## 循环防护与写回保护（2026-08-06 修复）

**refine_content 写回保护（P0，防数据丢失）**：提供 `section` 且写回项目时，工具自动读取项目内当前整节内容作为 Refiner 权威底稿（`readStoredSectionContent`），模型传的 `draftText` 片段被忽略；Refiner 输出较原文骤减（<40%）时拒绝写回。曾致整节被片段覆盖（introduction 2517→111 字）。

**read_section 隔离（P1a）**：同一章节连续读超上限（`maxConsecutiveSameTool`=3）即被阻断并加入隔离集；写进展（项目变更工具成功）前持续拦截，`clearBlockedReads` 放行。防止「穿插其他工具再读同章节」死循环。

**antispam 硬停机（P1b）**：停滞熔断（`MAX_STAGNANT_TOOLS`=3）触发累计 `breakCount`；同 goal 内达 `MAX_BREAKS_BEFORE_HARD_STOP`=2 次即硬停机（`finished=true` 进 finalize），不再放行工具，避免循环烧光 32 迭代/64 工具预算。

## 常用命令

- Agent 端到端剧本：`npm run eval:agent`（`src/lib/eval/agent-scripts.ts`，P1~P6 + FILE-READ 断言）
- 全量测试：`npx vitest run`（Agent 相关测试在 `src/__tests__/lib/agent-*.test.ts`、`src/__tests__/api/agent-*.test.ts`）
- 测试注意：Agent 接口用 `x-user-id` header 会 401（proxy 需 session cookie）；测试方式是 JWT_SECRET 签 token 作 cookie，或用真实域名登录。
