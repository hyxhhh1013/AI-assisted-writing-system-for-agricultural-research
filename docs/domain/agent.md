# Agent 编排（写作助手）

> L3 域文档 · 更新：2026-08-07
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
| `agent/progress` | **长工具执行期实时进度**（`label` 兼容 + 结构化 `stage`/`detail`/`chars`/`elapsedMs`/`info`/`warnings`） | **实时**（不持久化） |
| `agent/confirm` | 写操作需用户确认（import_reference 等） | 快照 |
| `agent/checkpoint` | S2 检查点（config_confirm / outline_approve / clarify） | 快照 |
| `agent/complete` | 完成摘要 `AgentSummary` | 快照 |
| `agent/error` | 错误 | 快照 |
| `agent/session` | 会话 id + 状态（running/interrupted/completed/error） | 快照 |

**实时 vs 快照**：快照事件随 graph 状态逐次产出并持久化进 `uiTranscript`；实时事件（`thought_delta`、`progress`）经 `LiveEventQueue` 即时推送，**不持久化、不进 uiTranscript、续跑不回放**。合并逻辑 `mergeGraphAndLive` 保证实时事件不被阻塞、graph 结束时排空缓冲。

## write_section 进度透传链路（2026-08-06 新增；2026-08-07 结构化扩展）

Agent 调 `write_section`（fast/full 双模式）时，写作管道内部本已发射 `status`/`pipeline_step`/`delta` 等进度事件，但原被 `writing-runner.ts` 收进本地数组丢弃，用户等待 1-3 分钟只见静态「正在撰写…」。

链路：

```text
runWritingPipeline emit(status/pipeline_step/delta/bullet_done/verification_progress/verification)
  → runAgentWriteSection.onWritingEvent（writing-runner.ts）
  → translateWritingEventToProgress（writing-progress.ts，delta 1000ms 节流累计字数）
  → ctx.emitLiveEvent({ type:"agent/progress", label, stage, detail, chars, elapsedMs, info, warnings })
  → LiveEventQueue → mergeGraphAndLive → SSE → use-agent 写状态卡
  → agent-panel 消息区顶部 sticky 写状态卡（WritingStatusCard）
```

- **agent/progress 结构化字段（2026-08-07）**：负载在 `label` 基础上新增全可选结构化字段：`stage`（`WritingStage`：retrieving/writing/verifying/refining/completed/error）、`detail`（当前阶段细节文案）、`chars`（已生成字数）、`elapsedMs`（本次写节耗时）、`info`（提示行，写入 `WriteStatus.info`）、`warnings`（警告行，写入 `WriteStatus.warnings`）。`label` 保留兼容：旧服务器只发 label、或旧前端只读 label 均可用，服务端仍拼好含章节名（`正在撰写「引言」· 生成初稿… 已 860 字`）。
- **verification_progress 事件（2026-08-07）**：`{ type: "verification_progress"; checked: number; total: number }`，来自 Verifier 逐条引用核查进度。模型流式输出 `〔进度 n/N〕` 标记，verifier 用 `findVerificationProgressMarkers` 解析、`stripProgressMarkers` 剥离后发射（`src/app/api/writing/pipeline/verifier.ts`）；writing-progress 翻译为 `已核查 n/N 条引用`（stage=verifying）。模型未吐标记时，前端回退到 `verification` 事件按字符数兜底（`已输出 N 字`）；主信号（verification_progress）出现后，字符兜底不再发射，避免覆盖主信号（`seenMarkerProgress`）。
- **WritingStatusCard 生命周期（2026-08-07）**：`agent/action`（tool=write_section）→ `initWriteStatus(section)` 初始化；`agent/progress` → `mergeProgressIntoWriteStatus` 合并（info/warnings 去重、elapsedMs 覆盖、终态保护：completed/error 后不再改 stage）；`agent/observation`（write_section）→ `finalizeWriteStatus` 定稿（成功 → completed + done 摘要，失败 → error + error 文案）；`agent/complete` / `agent/error` / `cancel` / `reset` / `startNewChat` / 切换项目（useEffect projectId 变化）→ 清空 `writeStatus`。卡片渲染在 agent-panel 消息区顶部（`sticky top-4 z-10`），写进度职责从 AgentWorkingIndicator 移交（`agent.writeStatus` 激活时不再渲染通用工作指示器）。
- `ctx.emitLiveEvent` 为可选字段；图循环在 `runAgentGraphLoop` 初始化时从 `runtime.emitLiveEvent` 注入（`run-graph.ts`）。

## 会话并发互斥

`tryAcquireAgentSession` 用 Postgres `updateMany` 原子抢占（仅 `status ∈ fromStatuses` 时置 running）。resume（interrupted/error）与跟聊（completed/interrupted/error）路径都走原子抢占；冲突 → HTTP 409「会话仍在执行中」，防止同一会话并发跑图、快照互相覆盖。`reclaimStaleRunningSessions` 回收进程退出遗留的僵尸 running。

## import_reference 确认批量选择（2026-08-07）

**问题**：Agent 自动收集到多篇文献后，确认卡原来只按模型传入的单篇 `hitJson` 弹一次「确认导入一篇」，导致「收集到很多、确认导入却一次一篇」。

**方案**：确认卡升级为「候选列表 + 勾选」，把「导入哪些」从模型行为中解耦：

- 确认生成（`nodes.ts` → `lib/agent/import-confirm.ts`）：`buildImportReferenceConfirmParams` 在 `enrichImportReferenceParams` 之上注入 `params.importItems` = 候选文献数组（`resolveImportReferenceCandidates` = 模型请求的 hits（`hitIndices`→last-search / `hitsJson` / `hitJson` / `doi`）∪ 最近一次检索全部命中，按 id/doi 去重，≤25）。
- `agent/confirm` 事件携带含 `importItems` 的 params，随快照持久化进 DB `awaitingConfirm`。
- 前端确认卡（`agent-panel.tsx`）：`importItems` 存在时渲染 checkbox 列表（默认全选）+ 全选/全不选 + 「确认导入 N 篇」。
- 用户批准：`use-agent.ts resolveConfirm(true, selectedIndices)` 回传 `confirmDecision.selectedIndices`（0 起索引数组）；`run-graph.ts` 把 `selectedIndices` 并入 `trustedParams` 重放。
- 工具执行（`tools/import-reference.ts`）：有 `selectedIndices` + `importItems` 时按勾选调 `importExternalReferencesToProject` 批量落库（自带 DOI/题录去重 + 批量入知识库），**跳过相关度门禁**（用户已亲眼确认）；未勾选任何 → 报「未勾选任何文献」。
- **批量导入进度（2026-08-07）**：`importExternalReferencesToProject` / `ingestExternalHitsToKnowledge` 支持 `onProgress(done,total,title)`，工具经 `ctx.emitLiveEvent` 发 `agent/progress`（`stage="importing"`，新增 `done`/`total` 字段，`label`="正在导入文献 i/N"，`detail`=标题）。前端 `use-agent` 渲染动画进度卡（进度条 + 百分比 + **逐篇状态列表**：✓已导入 / 当前处理中动画 / ○待处理），observation/complete/error 后清空——解决批量导入 OA 下载期间 UI「干等/卡住」。
- **确认续跑实时排空（2026-08-07 修复）**：确认批准后 `run-graph` 直接 `await tool.execute`，原实现会让 `ctx.emitLiveEvent` 积压在 `LiveEventQueue`、等 execute 结束才一次性倒出 → 前端只看到「进行中」无进度。现改为执行期间 `Promise.race(executePromise, liveQueue.next())` 边等边 yield 实时事件，execute 结束 `liveQueue.clear()` 丢弃陈旧事件（`LiveEventQueue.clear()`）。

**契约**：`AgentRequest.confirmDecision.selectedIndices?: number[]`（`contracts/agent.ts` + `validations.ts`，`z.array(z.number().int().min(0)).max(50).optional()`）；`lib/agent/types.ts` 同源。旧客户端/旧快照无 `importItems` 时行为不变（仍走原单篇/批量确认）。

## 蓝图批准检查点 blueprint_approve（2026-08-07）

`generate_writing_blueprint` / `build_argument_blueprint` 持久化后，若为 academic-paper 全流程目标（`isApFullStyleGoal`，entryMode=full 前缀含 `academic-paper` 即命中）且本轮未批准过 → 后置门禁 `blueprintApproveGate` 暂停，`buildBlueprintCheckpoint` 弹出「一起确认写作蓝图」（预览 + 批准/需修改）。批准后 `decisionMessage("blueprint_approve","approve")` 指示模型严格按蓝图推进。`run-graph.ts` 恢复时按 checkpointId 含 `blueprint` 映射 `blueprint_approve`。前端复用通用检查点 UI（与 outline 一致）。
- **查看/编辑完整蓝图（2026-08-07）**：`blueprint_approve` 检查点卡额外显示「打开蓝图工作台（查看 / 编辑）」按钮（`agent-panel` 新增 `onOpenBlueprint` 回调，由 workbench 接 `handleOpenBlueprintDialog` 打开既有 `BlueprintWorkspaceDialog`）。`generate_writing_blueprint` 属 `PROJECT_MUTATING_TOOLS`，生成后工作台自动刷新 `writingBlueprint`，确保按钮打开的是最新蓝图。
- **对话里「看看蓝图」调出工作台（2026-08-07）**：新增只读工具 `open_blueprint_workspace`（`tools/open-blueprint-workspace.ts`）。Agent 识别到用户想看/编辑写作蓝图时调用它；前端 `agent-panel` 收到该工具的成功 observation 后自动 `onOpenBlueprint()` 打开工作台。蓝图未生成时工具报错，Agent 应先生成蓝图。

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
