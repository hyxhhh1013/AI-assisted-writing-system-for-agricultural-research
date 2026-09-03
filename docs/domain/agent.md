# Agent 编排（写作助手）

> L3 域文档 · 更新：2026-09-03（侧栏高度断点：收口条不得裁掉输入框）  
> 契约唯一权威源：`src/contracts/agent.ts`（SSE 事件）、`src/contracts/agent-session.ts`（会话消息）、`src/contracts/agent-intent.ts`（`IntentKind`）。

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
- **DeepSeek V4 + tools**：`buildChatCompletionsBody` 关闭 thinking。V4 默认 thinking 开着时，带 tools 的后续请求必须回传上一轮 `reasoning_content`；本仓库把 Plan/工具观察写成普通 assistant/user，回传不了，会 400（`reasoning_content in the thinking mode must be passed back`）。无 tools 的写节/审查不受影响。

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
| `src/lib/agent/tools/registry.ts` | **工具唯一挂载表**（`READ_TOOLS` / `WRITE_TOOLS`）；`createAgentTools` 只读此表（W3-AP-ARCH-01） |
| `src/lib/agent/ingest-project-data.ts` | 表格入库合并 + 只 PATCH `dataSources`/`dataClaims`（`ingest_project_data`） |
| `src/lib/agent/writing-progress.ts` | 写节进度翻译层（管道事件 → `agent/progress` label） |
| `src/lib/agent/writing-quality.ts` | WQC 写作质检轻量：喉清开场 / 综上所述堆砌 / overclaim / 段长方差（确定性规则，warn 级不阻断） |
| `src/lib/agent/writing-qa-run.ts` | WRITE-QA-003 写节热路径 QA：`evaluateSectionWritingQa` → `WritingQaReport`（`block` 不 persist） |
| `src/lib/agent/section-compiler.ts` | WRITE-QA-002：蓝图/要点/语域 → `SectionSpecV1` |
| `src/lib/agent/evidence-binder.ts` | WRITE-QA-004：主张钉到项目题录/摘要/dataClaims（词重叠，不做 per-card RAG） |
| `src/lib/agent/writing-patches.ts` | WRITE-QA-005：`applyWritingPatches` 纯函数表（喉清/空话/越界引用/摘要引用/MD 标题/文末文献表/结果混讨论/overclaim） |
| `src/lib/agent/writing-patch-run.ts` | WRITE-QA-005：写节回修环；确定性之后最多 1 次定向 refine |
| `src/lib/agent/quality-closure.ts` | 质量收口看板：节完整度 / 摘要 / 引用硬检 / 审查 / 文风质检（WRITE-QA-006） |
| `src/lib/agent/writer-prompt.ts` | WRITE-QA-007：Agent slim Writer；禁令改 QA code 指针，不堆「禁止」 |
| `src/lib/agent/spec-write-context.ts` | WRITE-QA-009：Writer 上下文由 Spec 生成；`sectionSpec` JSON 解析 |
| `src/lib/agent/writing-profiles.ts` | WRITE-QA-010：引言缺口 / 结果无数量 / 综述写成试验 |
| `src/lib/quality-eval/write-qa-fixtures.ts` | WRITE-QA-008：分节 golden；`eval:quality` 规则尺 |
| `src/lib/agent/core/agent-rules.ts` | `AGENT_RULES` 单一事实源；prompt/nudge/硬拦文案读同一 `text` |
| `src/lib/agent/core/classify-intent.ts` | 每轮 `classifyIntent`：跟聊继承或正则；不上 LLM |
| `src/lib/agent/continue-hint.ts` | 输入区「继续推进」条：口头未执行 / 计划未完 / 建议写节 / 泛化跟聊 |
| `src/lib/agent/ui-failure.ts` | 红框 `lastFailure`：检索无命中是软结果，不弹「再试一次」 |
| `components/shared/agent/quality-closure-panel.tsx` | 质量收口看板 UI（工作台 agent Tab 顶部） |
| `src/lib/agent/writing-runner.ts` | 复用写作管道；`onWritingEvent` 转发进度 |
| `src/lib/agent/session-store.ts` | 会话持久化 + `tryAcquireAgentSession` 并发互斥 |
| `src/hooks/use-agent.ts` / `components/shared/agent/agent-panel.tsx` | 前端状态机与面板；空闲时输入框上方「继续推进」条（检查点同款克制条，非发送旁按钮）。工作台 Agent Tab 里质量收口条与面板是上下兄弟：面板外包 `flex-1 min-h-0`，禁止再让 `h-full` 与收口条叠满父级把输入框裁掉 |
| `src/hooks/use-editor-sync.ts` | 编辑器→project 防抖同步。Agent 写回时 `bumpEditorSyncEpoch`，禁止空的当前节（默认引言）把刚 persist 的正文盖掉 |
| `src/app/api/agent/route.ts` | SSE 路由（认证、会话抢占、流式输出）；客户端断开后 `enqueue`/`close` 软失败，不记 `agent stream error` |

## SSE 事件表（`contracts/agent.ts`）

| 事件 | 说明 | 实时/快照 |
|------|------|-----------|
| `agent/status` | 状态机：planning/thinking/executing/finalizing/awaiting_checkpoint/completed/error/cancelled | 快照；**thinking 在 LLM 开始时额外 live 推一次**，避免空转数十秒无气泡 |
| `agent/plan` | Plan 子任务列表 + 焦点 | 快照 |

**计划推进（2026-08-23）**：`advancePlanAfterTool` 有 `toolHints` 时只认 hints，不再用标题里的「大纲/文献」串味。`list_references` / `generate_outline` 不得把「依据大纲生成写作蓝图」标完成。口头宣布要生成蓝图/`write_section` 但未调用工具时注入续跑，禁止空 `agent/complete`。`开始吧` 视为跟聊继承意图；SSE 中途断开不再伪装成「已完成」。`finished=true` 时不得因续跑计数再打回 `agent`（否则 `planContinueCount` 停在 1–2 会自环到 LangGraph 512）。读/检索不清零续跑计数。

**任务结束 vs 续跑条（2026-08-23）**：图循环 `finished=true` → `finalize` → `agent/complete` 才是一轮结束。续跑条只看**本轮**（上一句用户之后）的 thought / observation，禁止拿上一轮「口头未执行」摘要继续推荐同一节。本轮 `write_section` 成功后改为「已写回」并指向下一空节。前端 SSE 已断但 DB 仍 `running` 时，跟聊/续跑先 `interruptRunningSession`（不再等 45s），界面出示「接上进度 / 强制结束」，409 不再叠用户气泡、不当红框失败。收尾「还有未完成步骤」不再举例「先写引言」（会误触发 write_section 宣布）；续跑条有未完成计划时只发「继续」，不改推写另一节。

**确认/检查点不是孤儿会话（2026-08-23）**：`import_reference` 等人勾选、以及 `outline_approve` 等检查点期间，SSE 会按终态结束（`inFlight=false`）但 DB session 仍 `running`。不得把「接上进度 / 强制结束」叠在确认卡上。`shouldShowOrphanedSession`：有 `pendingConfirm` / `pendingCheckpoint` 或 `status=awaiting_checkpoint` 时隐藏孤儿条。项目打开时若最近会话仍 `running` 且快照带 `awaitingCheckpoint` / `awaitingConfirm`，历史接口随 transcript 一并返回，前端直接恢复确认卡，不必先点「接上进度」。

**大纲人控（2026-08-23；过目页 2026-09-03）**：`generate_outline` 一旦 `persistToProject` 写回，**一律**弹 `outline_approve`（不再要求 goal 像「整篇/从零」；新大纲作废本轮旧批准）。检查点带全文（优先 `data.outline`，上限 24k），侧栏是「需要你拍板」收口卡，过目页用 Dialog 通读标题芯片 + 正文，批准或留下改结构意见。`generate_outline` 服务端读取本会话文档附件：文件名含大纲/提纲/框架等，或短文档能抽出 ≥3 个一级标题，则锁为 `userSkeleton` 并注入附件摘录，禁止默认综述/IMRaD 另起炉灶。指定 `attachmentId` 未就绪则报错，不静默回落。长论文 PDF 不自动当框架。表格仍走 `ingest_project_data`，不进大纲骨架。实现：`lib/agent/outline-from-attachment.ts` + `core/checkpoints.ts` + `components/shared/agent/agent-outline-review.tsx`。

**人控过目页家族（2026-09-03）**：所有「等人拍板」不再用 96px `<pre>` + 批准/需修改。共用 `AgentHitlBanner`（需要你拍板 · 已暂停），自动打开 Dialog 通读后再点 CTA：

| 节点 | 组件 | 用户看到什么 |
|------|------|----------------|
| `outline_approve` | `agent-outline-review.tsx` | 大纲全文 + 标题芯片 + 改结构 |
| `blueprint_approve` | `agent-blueprint-review.tsx` | 主张 / 各节要点 / 配图计划 + 改蓝图 |
| `clarify`（`ask_user`） | `agent-clarify-card.tsx` | 问题引用块 + 大回答框（侧栏即可，不弹层） |
| `config_confirm` | `agent-config-qa.tsx` + HITL 眉题 | 一问一答表单，检查点时加高 |
| `import_reference` / `remove_figure` / `remove_references` | `agent-tool-confirm.tsx` | 导入勾选列表或删除对象全文；破坏性操作用红色眉题 |

`generate_writing_blueprint` 的 `data.preview` 为 `formatBlueprintPreview` 全文（上限同大纲 24k）。实现：`lib/agent/hitl.ts`、`lib/agent/blueprint-review.ts`。
| `agent/thought` | 完整思考（终） | 快照 |
| `agent/thought_delta` | LLM 回复逐 token 增量 | **实时**（不持久化） |
| `agent/action` | 工具被调用（params）。不需确认的工具经 `emitLiveEvent` **实时**推送（长工具如 `write_section` 执行期间前端即时显示工具卡）；需确认工具仍走快照（确认路径直接 yield） | 实时（不需确认）/ 快照（需确认） |
| `agent/observation` | 工具结果（result/error） | 快照 |
| `agent/progress` | **长工具执行期实时进度**（`label` 兼容 + 结构化 `stage`/`detail`/`chars`/`elapsedMs`/`info`/`warnings`） | **实时**（不持久化） |
| `agent/confirm` | 写操作需用户确认（import_reference 等） | 快照 |
| `agent/checkpoint` | S2 检查点（config_confirm / outline_approve / blueprint_approve / clarify） | 快照 |
| `agent/complete` | 完成摘要 `AgentSummary` | 快照 |
| `agent/error` | 错误 | 快照 |
| `agent/session` | 会话 id + 状态（running/interrupted/completed/error） | 快照 |

**实时 vs 快照**：快照事件随 graph 状态逐次产出并持久化进 `uiTranscript`；实时事件（`thought_delta`、`progress`、不需确认的 `agent/action`）经 `LiveEventQueue` 即时推送。`thought_delta`、`progress` **不持久化、不进 uiTranscript、续跑不回放**；`agent/action` 会 append 进 `uiTranscript`（`run-graph.ts` live 分支），保证快照/历史气泡完整。合并逻辑 `mergeGraphAndLive` 保证实时事件不被阻塞、graph 结束时排空缓冲。

- **agent/action 实时化（2026-08-08）**：原来 `agent/action` 由 `toolsNode` push 进 `state.events`，要等整个节点执行完（`write_section` 可达 30-60s）随 graph 快照 emit，运行中前端只见「思考中」看不到工具卡。改为不需确认的工具在 execute 前经 `runtime.emitLiveEvent` 实时推送（`nodes.ts`），前端立即显示「进行中」工具卡；`agent/observation` 仍随快照 emit，前端按 action→observation 配对展示结果。需确认工具（`import_reference` 等）保持原路径：确认前快照 emit，确认后 `run-graph.ts` 确认路径直接 yield。

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
- **WritingStatusCard 生命周期（2026-08-07；2026-08-08 移到底部）**：`agent/action`（tool=write_section）→ `initWriteStatus(section)` 初始化；`agent/progress` → `mergeProgressIntoWriteStatus` 合并（info/warnings 去重、elapsedMs 覆盖、终态保护：completed/error 后不再改 stage）；`agent/observation`（write_section）→ `finalizeWriteStatus` 定稿（成功 → completed + done 摘要，失败 → error + error 文案）；`agent/complete` / `agent/error` / `cancel` / `reset` / `startNewChat` / 切换项目（useEffect projectId 变化）→ 清空 `writeStatus`。**卡片渲染在 agent-panel 消息流底部**（与 `AgentWorkingIndicator` 同位置：仅 `isWriteStatusLive` 时用写状态卡挡住通用指示器，完成后仍显示「正在思考/导入」），不再悬浮顶部；`writeStatus` 加入自动滚底依赖。
- **写作进度可见性（2026-08-08）**：生成初稿且 `chars=0` 时，卡片显示「等待 AI 输出首段（通常数秒）」+ spinner，替代误导性的「已 0 字」（用户误以为卡住）；非 writing 阶段 0 字不显示字数。让用户明白后端在等待 AI 首次输出而非异常。
- **附件提取失败自动重试（2026-08-08）**：上传 xlsx 等附件后提取失败（extract_failed）时，`read_attachment` 会自动重试一次提取（`retryAttachmentExtraction`：文件仍在则重新解析），成功后返回内容；仍失败返回友好提示「可重新上传或稍后再读」。修复「上传 xlsx 显示未能解析且无法恢复」。
- **xlsx 提取 Turbopack 兼容（2026-08-08）**：根因——SheetJS `XLSX.readFile(path)` 依赖库内部 `_fs`（模块加载时 `require('fs')` 捕获），Next.js Turbopack 下 `_fs` 为 undefined，导致即使文件存在也报「Cannot access file」。修复：`extractAttachmentText` 改用 `fs.readFileSync(path)` 读 buffer → `XLSX.read(buf)`，绕开 SheetJS 内部 `_fs`。诊断日志 `[attachment] extract not ready` 记录失败原因。
- `ctx.emitLiveEvent` 为可选字段；图循环在 `runAgentGraphLoop` 初始化时从 `runtime.emitLiveEvent` 注入（`run-graph.ts`）。

## 会话并发互斥

`tryAcquireAgentSession` 用 Postgres `updateMany` 原子抢占（仅 `status ∈ fromStatuses` 时置 running）。resume（interrupted/error）与跟聊（completed/interrupted/error）路径都走原子抢占；冲突 → HTTP 409「会话仍在执行中」，防止同一会话并发跑图、快照互相覆盖。`reclaimStaleRunningSessions` 回收进程退出遗留的僵尸 running。

## import_reference 确认批量选择（2026-08-07）

**问题**：Agent 自动收集到多篇文献后，确认卡原来只按模型传入的单篇 `hitJson` 弹一次「确认导入一篇」，导致「收集到很多、确认导入却一次一篇」。

**方案**：确认卡升级为「候选列表 + 勾选」，把「导入哪些」从模型行为中解耦：

- 确认生成（`nodes.ts` → `lib/agent/import-confirm.ts`）：`buildImportReferenceConfirmParams` 在 `enrichImportReferenceParams` 之上注入 `params.importItems` = 候选文献数组（`resolveImportReferenceCandidates` = 模型请求的 hits（`hitIndices`→last-search / `hitsJson` / `hitJson` / `doi`）∪ 最近一次检索全部命中，按 id/doi 去重，≤25）。
- `agent/confirm` 事件携带含 `importItems` 的 params，随快照持久化进 DB `awaitingConfirm`。
- 前端确认卡（`agent-tool-confirm.tsx` 挂 `import-confirm-list.tsx`）：`importItems` 存在时自动打开确认页，checkbox 列表（默认全选）+ 全选/全不选 + 「确认导入 N 篇」。点标题可展开作者、摘要（检索未带摘要则提示打开原文）和 DOI/OA 链接；侧栏只留「打开确认页」收口卡。不再用截断标题 preview 顶替正文。
- **进行中 UI（2026-08-23）**：`use-agent` 的 `isRunning` 看 SSE 是否还在飞（`inFlight`），不再只看最后一条 `agent/status`。V4 关 thinking 后 LLM 可能长时间无 `thought_delta`，节点开始时 live 推 `thinking`；写节完成卡不再挡住底部「正在思考/导入」指示器（`displayProgress` 只在 `isWriteStatusLive` 时抑制）。
- **侧栏高度断点（2026-09-03）**：质量收口看板在 Agent Tab 顶部、与 `AgentPanel` 兄弟排布。面板必须包在 `flex-1 min-h-0 overflow-hidden` 里，否则 `h-full` + 收口条会超出父级、`overflow-hidden` 裁掉输入框。收口芯片改为单行横滑；顶栏 Plan 用 `compact` 限高；配置问答 max-height 从 52vh 收到约 16–18rem，避免把对话区挤没。
- 用户批准：`use-agent.ts resolveConfirm(true, selectedIndices)` 回传 `confirmDecision.selectedIndices`（0 起索引数组）；`run-graph.ts` 把 `selectedIndices` 并入 `trustedParams` 重放。
- 工具执行（`tools/import-reference.ts`）：有 `selectedIndices` + `importItems` 时按勾选调 `importExternalReferencesToProject` 批量落库（自带 DOI/题录去重 + 批量入知识库），**跳过相关度门禁**（用户已亲眼确认）；未勾选任何 → 报「未勾选任何文献」。
- **批量导入进度（2026-08-07）**：`importExternalReferencesToProject` / `ingestExternalHitsToKnowledge` 支持 `onProgress(done,total,title)`，工具经 `ctx.emitLiveEvent` 发 `agent/progress`（`stage="importing"`，新增 `done`/`total` 字段，`label`="正在导入文献 i/N"，`detail`=标题）。前端 `use-agent` 渲染动画进度卡（进度条 + 百分比 + **逐篇状态列表**：✓已导入 / 当前处理中动画 / ○待处理），observation/complete/error 后清空——解决批量导入 OA 下载期间 UI「干等/卡住」。
- **确认续跑实时排空（2026-08-07 修复）**：确认批准后 `run-graph` 直接 `await tool.execute`，原实现会让 `ctx.emitLiveEvent` 积压在 `LiveEventQueue`、等 execute 结束才一次性倒出 → 前端只看到「进行中」无进度。现改为执行期间 `Promise.race(executePromise, liveQueue.next())` 边等边 yield 实时事件，execute 结束 `liveQueue.clear()` 丢弃陈旧事件（`LiveEventQueue.clear()`）。

**契约**：`AgentRequest.confirmDecision.selectedIndices?: number[]`（`contracts/agent.ts` + `validations.ts`，`z.array(z.number().int().min(0)).max(50).optional()`）；`lib/agent/types.ts` 同源。旧客户端/旧快照无 `importItems` 时行为不变（仍走原单篇/批量确认）。

## 蓝图批准检查点 blueprint_approve（2026-08-07）

`generate_writing_blueprint` 持久化后，若为 academic-paper 全流程目标（`isApFullStyleGoal`，entryMode=full 前缀含 `academic-paper` 即命中）且本轮未批准过 → 后置门禁 `blueprintApproveGate` 暂停。`buildBlueprintCheckpoint` 带 `formatBlueprintPreview` 全文（上限 24k）。前端不再复用「96px 预览 + 批准/需修改」：侧栏人控卡 + Dialog 结构化展示主张/各节要点/配图计划（优先 `project.writingBlueprint`），批准或留下改蓝图意见；仍可「在蓝图工作台打开」。批准后 `decisionMessage("blueprint_approve","approve")` 指示模型严格按蓝图推进。`run-graph.ts` 恢复时按 checkpointId 含 `blueprint` 映射 `blueprint_approve`。
- **查看/编辑完整蓝图（2026-08-07；过目页 2026-09-03）**：`blueprint_approve` 过目页内「在蓝图工作台打开」（`agent-panel` 的 `onOpenBlueprint`，由 workbench 接 `handleOpenBlueprintDialog`）。`generate_writing_blueprint` 属 `PROJECT_MUTATING_TOOLS`，生成后工作台自动刷新 `writingBlueprint`，确保打开的是最新蓝图。
- **对话里「看看蓝图」调出工作台（2026-08-07）**：只读工具 `open_blueprint_workspace`。仅当用户明确要求打开/编辑时调用；**禁止**在 `generate_writing_blueprint` 后自动调用。前端仅对本轮**新追加**的成功 observation 自动打开（`blueprint-open-guard`）；会话恢复/面板重挂载不因历史记录误弹。observation 卡另有「打开蓝图工作台」按钮可手点。
- **工作台随内容自适应（2026-08-07）**：蓝图 schema 新增可选 `projectMode`/`language`（生成时用项目兜底填充）；工作台按顶层章节把 `sectionGuides` 树形分组（`" > "` 层级，顶层可折叠）、按论文类型显示徽标与配图提示（综述→概念图/对比表，研究→方法流程图/结果数据图）、空区块（前置条件/配图/章节导览/写作顺序）自动隐藏。分组纯函数 `groupSectionGuides` 在 `lib/blueprint-utils.ts`。
- **蓝图顺序注入 Agent 简报（2026-08-08）**：修复「蓝图建议写作顺序与实际写作顺序不一致」——此前 `project-briefing` 只给 LLM「写作蓝图：有 + thesis 摘要」，`writingOrder` 与 `sectionGuides` 未进 Agent 决策输入，Agent 靠直觉/大纲顺序写。现在 `loadAgentProject` 额外提取 `blueprintWritingOrder`/`blueprintSectionGuides`（`project-loader.ts`），简报注入「建议写作顺序（蓝图）：1. x → 2. y → …」+「各节写作要点（蓝图）」区块（`project-briefing.ts`）。Agent 写作前即可见蓝图建议顺序并按序推进。
- **蓝图真正驱动 Writer（2026-08-09）**：修复「批准蓝图后正文仍不按蓝图生成」。根因：①`loadAgentProject` 曾把 `WritingBlueprint` JSON 误 `as WritingGlobalContext`，`prepare-context` 读 `globalContext.blueprint` 恒为 undefined，【写作蓝图摘要】不进 Writer；②`write_section` 未调用工作台同款的本节蓝图注入（purpose/keyPoints/配图）。现：loader 用 `parseWritingBlueprint` 正确嵌套 `globalContext.blueprint` 并附 outline/sectionPreviews；`lib/agent/blueprint-write-context.ts` 将英文 section key 映射到大纲/蓝图中文路径，聚合本节 guides 注入 `【写作蓝图（本节）】`；简报补 keyPoints + 配图计划；system prompt / 工具说明要求对齐蓝图。
- **综述正文禁止一次写整章（2026-08-09）**：Agent 曾把 phase 文案「一次任务可连续写多节」理解成对 `literature_body` 一次写出 5–7k 字（UI 可达万字+），导致超时/质量塌陷。现：① phase-pack / planner / review_write nudge / system prompt 明确「按蓝图子节 + subsectionTitle 逐节写」；② `write_section` 在 `literature_body` 无 `subsectionTitle` 且蓝图有 ≥2 子节路径时 soft-gate 拒绝并列出建议标题。
- **论证并入写作蓝图（2026-08-09，方案 A）**：产品主路径改为 `配置 → 大纲 → 写作蓝图 → 分节写`。`SectionGuide` 增加 `claim` / `evidenceHint` / `warrant` / `rebuttal`；全文级 `researchQuestion` / `argumentGaps`。`ensure-write-prereqs` / phase-gate 不再要求 `build_argument_blueprint`；检查点只对 `generate_writing_blueprint` 暂停。Passport Phase 3 有写作蓝图即 done。旧 `argumentBlueprint` 列保留只读兼容。
- **卸掉弃用工具注册（2026-08-11）**：`createAgentTools` 不再注册 `build_argument_blueprint`（源文件保留作说明，`UNREGISTERED_TOOL_FILES`）；planner / Phase 3 hint 文案改为「确认写作蓝图主张」，不再引导生成独立论证蓝图。
- **工具挂载表（2026-08-16，W3-AP-ARCH-01）**：`tools/registry.ts` 为唯一挂载点。加工具：新建 `tools/<name>.ts` + 推进 `READ_TOOLS` 或 `WRITE_TOOLS`。禁止运行时扫磁盘。忘了挂表则 `agent-tool-registry.test.ts` 红。
- **工具 UI 对齐体检（2026-08-23）**：每个已挂载工具必须在 `ui-progress.ts` 的 `TOOL_LABELS` 有中文名（`agent-tool-registry.test.ts` 断言 `toolDisplayName(name) !== name`）。XRD 出图走与 `generate_chart` 相同的图卡（`keepData` + `isFigureCard` + 回放 `figureSpecEnc`）。`generate_table` 纳入计划关键词。`parseBoolParam` 把 LLM 的 boolean `false` 与 `"false"`/`"0"` 一并视为否（XRD `insertTable` 等）。附件：上传后台提取（xlsx 走 buffer、失败可重试），`generate_outline` 会读框架附件锁一级标题。
- **大纲阈值统一（2026-08-11）**：`MIN_OUTLINE_CHARS = 20`（`lib/outline-threshold.ts`）供写门禁与 Passport Phase 2 共用，消除 20 vs 80 漂移。
- **破坏性删除需确认（2026-08-11）**：`remove_figure` / `remove_references` 标 `requiresConfirmation` + `safety: "destructive"`，确认卡文案见 `confirm-message.ts`。
- **写作蓝图「结构无效」修复（2026-08-09）**：首因是 prompt 示例 `language: Chinese/English`（schema 仅 `zh|en`）。复查后发现仍会因 `dataSource`/`projectMode` 非法枚举、`keyPoints` 写成字符串、`estimatedWordCount` 写成 `"6000-12000"`、缺 `version`/空 items 等失败。现：① prompt 按 review/research 分示例并写明枚举约束；② `blueprint-coerce.ts` 纠偏上述偏差并在必要时合成最小合法 figure/guides；③ 错误文案带字段路径。API 与 `generate_writing_blueprint` 共用。
- **蓝图文献源 + 分析笔记进 Writer（2026-08-09）**：`sectionGuides.assignedSources`（文件名或 `[n]`）经 `blueprint-write-context` 解析为 `selectedSourceIds`，Agent `write_section` 限 RAG 范围（解析为空则不限，避免误清空）。`loadAgentProject` 加载 `analysisResults` 进 `globalContext.analysisResults`，与工作台扩写一致。
- **自动补齐插入批准检查点（2026-08-08；2026-08-23 大纲一律确认）**：`ensureNextWritePrerequisite` 一次只补一个缺失前置；`buildPrereqCheckpoint` 在大纲写回后**无论 goal 是否 ap-full**都暂停 `outline_approve`。蓝图检查点仍仅 ap-full。resume 后继续补下一个 / 执行写工具。
- **蓝图常驻入口（2026-08-07）**：工作台侧栏头（非 Agent Tab）与 Agent 面板头均新增「蓝图」按钮（Map 图标），随时可打开蓝图工作台；无蓝图时点击自动切到「章节结构」侧栏引导生成。
- **文献分类编码持久化（2026-08-07）**：新增写工具 `save_reference_classification`（`tools/save-reference-classification.ts`），把「文献分类编码」结果批量 upsert 到 `ReferenceSource`（refIndex 1 基 → sourceName/category/citation），与前端「引用-文献映射」同一张表。`list_references` 输出附带 `category`/`sourceName`，写作时 Agent 能看到分类。属 `PROJECT_MUTATING_TOOLS`，保存后工作台刷新。之前 Agent 只能靠多次关键词检索在对话里"分类"、结果不落库，现已闭环。
- **删除不相关文献（2026-08-07）**：新增写工具 `remove_references`（`tools/remove-references.ts`），按引用编号（1 基 [n]）删除不相关/误导入文献，自动重排后续编号，并同步清理/重排 `ReferenceSource` 分类映射。若正文已引用被删编号，工具说明要求随后 `validate_citations` 检查越界引用。
- **确认卡质量信号（2026-08-07）**：import_reference 确认卡候选列表每项显示质量徽标：被引数、来源（OpenAlex/S2/CrossRef/PubMed）、OA 标，便于用户确认导入前判断文献质量。
- **被引数下限（2026-08-07）**：`MIN_IMPORT_CITEDBY`（env，默认 0=关闭）。设置后单篇/批量导入时被引数低于阈值的文献需 `why`（≥8字）说明才可导入，批量会自动过滤低被引条目。

## 引用核查 / 引用修正意图门禁（2026-08-07 修正）

`goal-intents.ts` 负责把用户 goal + 会话 observations 解析成「引用核查/修正」意图，并驱动 `checkCitationSideTripGate` 拦截检索、导入、写摘要、**写其它章节**等旁路。判定的关键信号是 `validate_citations` 的成功记录——但该工具同时被两条路径触发：**用户主动要求引用核查**，以及 **`reflect.ts` 写完章节后的例行动作自查**。旧实现只看「是否成功跑过 validate」就判定进入引用修正模式，导致：

- **跟聊误判**：写完自查通过（0 问题）后，用户回「好/继续」，`isCitationApplyGoal` 误当「同意引用修正」→ `checkCitationSideTripGate` 拦下后续 `write_section`（「当前是引用核查/修正任务…」）。
- **AP 流程起草被顶**：`resolveApPipelineStep` 只要 validate 成功就返回 `citation_fix`，正在起草其它章节的 `write_section` 被误拦。

**修正（2026-08-07）**：进入「引用修正」意图/阶段必须满足**最近一次 validate 报告确实发现待修问题**。写完自查的干净报告（0 问题）不再把会话顶进修正模式，后续 `write_section` 正常放行。覆盖链路：跟聊短确认、AP 流程 `citation_fix` 阶段、并行只读批门禁（`parallel-tools.ts` 同源）。

**修正（2026-08-22）——软可疑不再卡死双语摘要**：`citation_fix` / `isCitationApplyGoal` 只认硬检（`validateHasHardIssues`：`exportReady/phase5Passed` 未过，且非空项目）。`suspiciousCount > 0` 但硬检已过时，流程进入摘要，`write_bilingual_abstract` 放行。门禁文案「请先 read_section + refine_content…」不再弹红框。

**修正（2026-08-22）——硬检通过后禁止分页空转**：`checkCitationSpinGate` 在 AP/引用/摘要收口下，validate 硬检已过则拦截继续 `read_section` / `read_reference`（无摘要题录读不出接地）。硬检未过最多读 2 次章节，然后必须 `refine_content`。连续同章翻页警告不当红框。

**修正（2026-08-16）——空项目被顶进引用阶段、封死起草入口**：`resolveApPipelineStep` 原来没有「起草」阶段，空项目（0 文献 0 正文）也会直接返回 `citation_check`/`citation_fix`，`checkCitationSideTripGate` 因而把 `search_knowledge`/`import_reference`/`generate_outline`/`write_section` 全部拦下，agent 反复检索被拒、陷入空转。两处根治：

- `resolveApPipelineStep`：**尚未成功 `write_section`（起草未开始）时返回 `null`**，不套流水线门禁，放行补文献/大纲/写正文；`apPipelineNudge` 的 `null` 分支给出「先补配置/文献/大纲再写正文」的起草提示（区别于「各步已完成」）。
- `reflect.ts` `validateIssueCount`：**「无文献且文内无引用」的硬检未过（`gate.refCount===0 && gate.citationCount===0`）不再算 citation issue**，只当「还没导入文献」而非「错引要修」；`gate` 缺失（旧快照/简化测试）保持原判定。

- **引用修正收敛（2026-08-08）**：修复「Agent 陷入 validate→改引→再 validate 打地鼠循环，不收尾、没下一步」——`validate_citations` 的 summary 按硬错/软可疑分级引导（硬检越界必须修；可判定且明显错引改引一次；缺摘要/语义勉强属软性可接受，**不要反复重验**），并在通过时明确「引用已符合要求，请汇报并给下一步」；`buildAgentSystemPrompt` 增加「引用修正要收敛，勿打地鼠循环」规则。双保险让 Agent 在改引循环里能停下并给出下一步计划。
- **写章节缺文献照常写（2026-08-08 / RULES-01 2026-08-15）**：条文现只写在 `AGENT_RULES` id=`draft-missing-refs`；`buildAgentSystemPrompt` 与 `draftGoalNudge` 同读 `ruleText`。跟聊 goal 失真（「A/继续」）的写章节纪律由 `snapshot.intentKind` 继承（INTENT-01/02）。`checkDraftSearchGate` / 收尾兜底只认 `intentKind === "draft"`。

## 断点续跑 / 门禁旁路修复（2026-08-09）

**pending 工具续跑（P0）**：检查点/确认暂停时保留同批后续 `pendingToolCalls`（确认：`slice(tcIdx+1)`；后置大纲/蓝图检查点：同；自动补齐前置：仍为 `slice(tcIdx)` 含当前写工具）。`agentNode` 在 `pendingToolCalls.length > 0` 时短路放行、不再调 LLM，避免 resume 后冲掉已排队的 `write_section`。图拓扑仍为 `plan → agent → tools`，靠短路实现「批准后继续执行」。

**检查点「需修改」清空 pending（P0，2026-08-11）**：`applyCheckpointDecisionPatch` 在 `decision === "revise"` 时强制 `pendingToolCalls = []`。否则短路会直接重跑排队中的 `write_section`，用户修改意见进不了 LLM。批准路径仍保留 pending。

**并行只读门禁同源（P0）**：`runParallelReads` 改用与串行相同的 `evaluatePreGates` + `evaluatePhaseGate`（含摘要收口 / 审查 / 分类编码意图），修复批内多次 `list_references` / `search_*` 绕过意图门禁。

**工具名对齐**：`get_full_text` 残留 → `read_full_text`（antispam 只读豁免、plan 焦点、UI 标签）。

**指纹 / 空转**：快照增加 `referenceClassificationSig`；`save_reference_classification` / 图表类工具列入 `FINGERPRINT_BLIND_PROGRESS_TOOLS`（成功即清 stagnant，避免分类/出图被误判空转）。

**检查点 kind 回退**：`applyCheckpointDecision` 按 checkpointId 识别 `blueprint` / `clarify`，与 UI 文案映射一致。

## write_section 断点续写 / 去重（2026-08-09，W3-AP-WRITE-RESUME）

不做 Writer token 级续流（写作管道无流式 checkpoint）。策略是**执行中落草稿 + resume 去重**：

```text
write_section 开始 → 会话快照 activeWrite(status=running, draftText…)
  → 管道 delta 节流 patch（≥1.5s）更新草稿
  → 成功 → activeWrite=completed（防刚写完断线再烧一遍）
  → 中断/抛错 → activeWrite=aborted（保留已生成草稿）
resume → 恢复 activeWrite；若 pending 无写节则 ensurePendingWriteFromActive 补回
  → write_section：同 attemptKey 且草稿够长 → 跳过 AI，写回项目并标注 resumedFrom
```

| 字段 / 模块 | 说明 |
|-------------|------|
| `AgentActiveWrite`（`contracts/agent-session`） | attemptKey / params / draftText / status |
| `lib/agent/write-resume.ts` | 指纹、reuse 判定、pending 补回、事件累计草稿 |
| `ctx.patchActiveWrite`（`run-graph` 注入） | 与 graph persist 共用串行链，防互抢 |
| 复用阈值 | completed ≥80 字；partial/aborted ≥400 字；草稿上限 80k |

跟聊（followUp）清空 `activeWrite`。partial 复用未跑 Verifier/Refiner：`toolsNode` **硬排队** `refine_content`（同 figure QA 注入模式），summary 同步说明。

## Agent 单面 + 数据闭环（2026-08-15 规划）

产品方向：用户只待在 Agent Tab。表格/仪器走**附件上传**（不再以 data Tab 为主口）；研究型无数据根基时禁止写 results。页面收敛分波，第一刀不拆 Tab。

详规与 PR 序：[`plans/W3-AP-AGENT-HUB.md`](../plans/W3-AP-AGENT-HUB.md)（队列 Phase 11c）。

**已落地 DATA-01**：`lib/agent/data-foundation.ts`。研究型 `write_section(results)` 在根基 `empty` 时拒绝；`inspect_project` / 简报 / `list_plot_sources` 共用同一套状态。

**已落地 DATA-02**：`ingest_project_data`（`lib/agent/ingest-project-data.ts`）。附件 `attachmentId`/`fileId` 或粘贴 `csvData`+`fileName` → 复用 `analyzeFile` → 只 PATCH `dataSources`/`dataClaims`（同 fileName 覆盖源，按 sourceId 替换声明）。空表不写库。

**已落地 HUB-01**：表格附件上传时带 `projectId`；提取成功后自动 ingest（与 DATA-02 同一套）。芯片显示「已入库 · N 条声明」/「分析失败」。`kind` 由扩展名推断，不改 Prisma。

**已落地 DATA-03**：附件白名单含 `xy/xyd/ras/raw/uxd/dif`（谱文件只做两列预览）。`generate_xrd_analysis` 只吃已入库 `peakTable`（或 `sourceAttachmentId` 对应峰表）；裸 `peaksJson` 拒绝。Scherrer / 相检索成功后回写 `dataClaims`。

**已落地 DATA-04**：`write_section(results)` 写回前对账精确小数 ⊆ `dataClaims`（`results-number-reconcile.ts`）。约/数量级不拦。

**已落地 HUB-02**：工作台主栏默认 Agent + 结构；data/xrd/outline/writing 收进「专家工具」。`NEXT_PUBLIC_WORKBENCH_EXPERT_TABS=1` 恢复旧布局；`?tab=data` 仍可用。

**已落地 HUB-03**：`/plot` 不再挂工作台侧栏；配图坞只留「期刊精修」深链。路由与回写保留。

## 意图状态化 + 质量尺（2026-08-15 规划，Wave 3.9）

产品方向：跟聊不再用残缺 `goal` 字符串重判意图；规则只写一处；收口默认能量引用句意。

详规与 PR 序：[`plans/W3-AP-INTENT-QUALITY.md`](../plans/W3-AP-INTENT-QUALITY.md)（队列 Phase 11d）。

**即刻冻结**：不准再往 `goal-intents.ts` 加口语 `isXxxGoal` / `checkXxxGate`。领域不变量（空数据、越界引用）与事故型安全门除外。

**事故门（2026-08-22）——修订大纲被空检索打成红框**：用户说「基于 27 条文献修订大纲」时模型去补「生物炭/预处理」覆盖，`search_external` 0 命中曾 `success: false`，面板 `lastFailure` 循环「再试一次」。现：`checkOutlineSearchGate` 拦 search_*；空检索改为软成功；斜杠 query 拆空格；红框忽略无命中。用户要补文献须明确说「检索」。

**已收口（2026-08-15）**：INTENT-01/02、RULES-01、QUALITY-CLAIM、QUALITY-JUDGE。`classifyIntent` 每轮一次；跟聊短回复继承 `snapshot.intentKind`。gate / `nudgeForKind` 只消费 kind。`AGENT_RULES` 单一事实源（5 条）。收口默认 claim grounding。`eval:quality` 规则分 + 可选 LLM 分（不进写节）。**INTENT-SHADOW cancelled**：跟聊 inherit 已覆盖「A/继续」；规定的影子触发在 `source=regex`，测不到跟聊；无标注样本则不上热路径 LLM 分类。

## 写作质量系统（2026-08-22 起，Wave 3.12）

> **根因**：完整度/引用地板已齐，但写节仍是「超长 prompt + Writer 一锅生成 + 事后 LLM 审查」；质量债被「Agent 能写、人再改」锁死。  
> **目标态**：`SectionSpec` 编译 → Evidence Binder → 确定性质检 → writing patch。  
> **队列**：Phase 14 `WRITE-QA-001～010`；详规 [`plans/WRITE-QA-quality-system.md`](../plans/WRITE-QA-quality-system.md)。  
> **冻结**：不解冻 `POST /api/writing`；不复刻十二代理；禁止再往 `writing.ts` 堆「禁止」；热路径不用 LLM-judge。  
> **与 3.7 关系**：CITE-GROUND / DRAFT-COVER / WQC / ABS-FLOW 是地板，本波不推倒。  
> **契约（001 done）**：`src/contracts/section-spec.ts`（`SectionSpecV1`）+ `writing-qa.ts`（`WritingQaReport`）。旧 `write_section.context/bullets` 经 `liftWriteSectionInputToSpec` 升格；现有 WQC 经 `liftWritingQualityFindings` 升格。  
> **热路径（001–010 done）**：`write_section` 吃 `sectionSpec`（或编译）→ 绑定项目文献池 → **slim Writer** → QA（含引言/结果/综述剖面）→ 确定性修补 → 非 full 时最多定向 refine 1 次。`block` 不 persist。`eval:quality` 带分节 golden。专家工具扩写仍用 legacy 长 prompt。

## 车间图纸（2026-08-16 规划，Wave 3.10）

产品方向：循环够用；缺的是单一工具登记、可追查的短轨迹、旧扩写管不再加功能。不换 LangGraph / DeepSeek Harness。

详规与 PR 序：[`plans/W3-AP-RUNTIME.md`](../plans/W3-AP-RUNTIME.md)（队列 Phase 11e）。

**已落地 ARCH-01**：`lib/agent/tools/registry.ts` 为 `createReadOnlyTools` / `createAgentTools` 唯一挂载点。

**已落地 ARCH-02（会话工具轨迹）**：快照字段 `toolTrace?: AgentToolTrace[]`（`{ at, tool, ok, intentKind? }`，上限 `MAX_TOOL_TRACE=50`）。`toolsNode` / `runParallelReads` 每次工具调用结局（execute 成败、门禁 reject/soft/hard、未知工具、prereq 步骤、抛错）都 append 一条，图状态 reducer `slice(-50)` 截断。**不进前端 UI**，排障时 `AgentSession.snapshot.toolTrace` 里能看到「最近调了什么、成没成」，不必翻 pm2 日志。旧快照缺字段兜底 `[]`。

## 机理图 / 识图自检（2026-08-09）

**产品定位**：Agent 负责「结构正确的可编辑草稿」；期刊观感与个性化在 `/plot` + 对话迭代完成。不承诺一键出 Nature 级机理终稿。

| 层 | 行为 |
|----|------|
| L1 草稿 | `draft_mechanism_figure` 先编译 `MechanismSpecV1`（主张进 caption，步骤括号条件上边）；多机理图任务前 **FigureBrief clarify**；可选 `templateId`。未锁 `layout` 且 ≥4 步会带 chain/fork 两套候选，只入库推荐稿。**不用文生图当主渲染器** |
| L2 硬闭环 | **机理图**先看 `draft_mechanism_figure.qaReport`（`block` 不入库、按 findings 改 Spec）；过线后 toolsNode 才注入 `read_figure(mode=qa)` 扫残余观感。**数据图**看 `generate_chart.qaReport`（不跑视觉识图）。QA 未通过则禁止空口收尾 + 门禁 `replaceImageUrl`；同 caption/section 无 replace 时工具内自动就地替换（防叠图） |
| L3 精修 | **配图坞**（输入框上方常驻最近出图，免翻聊天）+ 结果卡：落点说明（默认**节末落盘**）+「查看正文位置」+ 结构化「按意见改」（含分叉/三面板/脱氧等快捷）+ `/plot?chartAssetId=&replaceImageUrl=` 深链（优先资产快照回放，精修回写默认真地替换）；编辑器「本节插图」可挪位 |
| 图质检两级（2026-08-09；008 收窄；MECH-QA 2026-08-23） | 机理图主尺是 `MechanismSpec` + `qaReport`（`contracts/mechanism-spec.ts` / `mechanism-qa.ts`）。识图 `figure-qa.ts` 只扫残余观感。数据图只看 ChartSpec `qaReport`。 |
| 精修回放加固（2026-08-10） | 根因：`uiTranscript` 未持久化 `plotHref`；长 `figureSpec` URL 易截断；`target=_blank` 新标签读不到 opener 的 `sessionStorage`。现：transcript 保留深链+轻量快照；`GET .../charts`；点击精修用 **`localStorage`** 暂存（`plot-prefill-stash.ts`）；绘图页按 assetId/imageUrl 回放并 remount 预填 |

| 工具 | 作用 |
|------|------|
| `draft_mechanism_figure` / `generate_chart` | 出图并写入图表库；可插章节。**改图传 `replaceImageUrl`/`replaceChartId` 就地替换**；同标题已有图自动 replace。机理图走 MechanismSpec（`claim` / 边条件 / `qaReport` / 版式候选）。数据图走 ChartSpec：显著性用 `significanceJson`；`configJson` 仅白名单（刊宽/DPI/`tight_layout` 会丢弃） |
| `remove_figure` | 删图表资产 + 默认去掉正文对应 `![](url)`（清重复旧图）；**需用户确认** |
| `read_figure` | `describe` 可识任意图；`mode=qa` **仅机理图**（占位/英文模板/空栏）。数据图跳过识图，看 `qaReport` |

实现：`lib/agent/figure-loop.ts`、`langgraph/tool-gates.ts`（`figureReplaceGate`）、`langgraph/nodes.ts`（自动排队 QA / FigureBrief）。视觉 provider：`callAI({ provider: "vision" })`（DeepSeek `deepseek-v4-flash-vision-exp`，复用写作 Key）。

## 循环防护与写回保护（2026-08-06 修复）

**refine_content 写回保护（P0，防数据丢失）**：提供 `section` 且写回项目时，工具自动读取项目内当前整节内容作为 Refiner 权威底稿（`readStoredSectionContent`），模型传的 `draftText` 片段被忽略；Refiner 输出较原文骤减（<40%）时拒绝写回。曾致整节被片段覆盖（introduction 2517→111 字）。

**read_section 隔离（P1a）**：同一章节连续读超上限（`maxConsecutiveSameTool`=3）即被阻断并加入隔离集；写进展（项目变更工具成功）前持续拦截，`clearBlockedReads` 放行。防止「穿插其他工具再读同章节」死循环。

**antispam 硬停机（P1b）**：停滞熔断（`MAX_STAGNANT_TOOLS`=3）触发累计 `breakCount`；同 goal 内达 `MAX_BREAKS_BEFORE_HARD_STOP`=2 次即硬停机（`finished=true` 进 finalize），不再放行工具，避免循环烧光 32 迭代/64 工具预算。

**antispam 指纹增强（2026-08-08）**：`projectFingerprint` 原来只用 section 字符数总和，refine_content 改引（如 [7]→[4]）字数不变时指纹不变 → 误报「无进展」。现在 `AgentSectionFill` 增加 `refNums`（该 section 去重排序的引用编号签名，`extractRefNumsSignature` 从正文提取），fingerprint 纳入 refs 维度，能检测「字数不变但引用变化」的实质写操作。

## 编排加固（配置检查点收窄 / 路由预算同源 / live 队列清理）

- **config_confirm 检查点收窄**：原 `shouldPauseForConfigConfirm` 只看「缺 paper config」即暂停，导致诊断 / 检索 / 引用核查 / 审查 / 分类编码等与论文配置无关的目标也被配置问答拦一道。现加入 goal 维度：仅 `isApFullStyleGoal`（整篇/从零/entryMode=full）、`isAcademicPaperPipelineGoal`、`isSectionDraftGoal` 命中时才触发，其余目标直接跳过（`core/checkpoints.ts` + `planNode`）。
- **路由预算同源**：`routeAfterAgent` 原硬编码 `COST_LIMITS.maxIterations`，与 `agentNode` 用的 `budget.maxIterations` 各持一份。现改为从 `config.configurable.agentRuntime` 读 `budget.maxIterations`（纯函数单测无 config 时回落 `COST_LIMITS`），避免将来调整预算时路由/节点分叉（`langgraph/state.ts`）。
- **LiveEventQueue.clear() 清 stale waiter**：确认续跑执行循环用 `Promise.race([executePromise, next()])` 排空进度，execute 胜出时 `next()` 会残留一个无人 await 的 waiter；原 `clear()` 只清 items 不清 waiter，恢复后首个实时事件（首段 thought_delta）会被旧 waiter 吞掉。现 `clear()` 同步摘掉 pending waiter（以 done 收尾），防事件丢失（`langgraph/run-graph.ts`）。
- **检查点 uiTranscript kind 同源**：续跑写用户气泡时不再手写 config/blueprint/outline 三元回退（漏了 clarify），改为 `resolveCheckpointKind`，与 `applyCheckpointDecisionPatch` 一致（`langgraph/run-graph.ts`）。
- **死代码清理**：移除未在生产使用的 `ensureWritePrerequisites`（复数；逐步补齐已统一走 `ensureNextWritePrerequisite`）与 `buildFocusNudge`（不再注入计划焦点假 user）；`registerTools` 接入 `createReadOnlyTools` / `createAgentTools`，重复工具名的运行时防护生效。

## 引用级 grounding 与质量评测集

### 引用级 grounding（claim 支撑判定）

词重叠（`citation-grounding.ts`）是快速免费代理，判不出「编号合法但句意张冠李戴」。新增第三层 `lib/citation-claim-grounding.ts`：

- `collectCitedSentences`：抽每个 [n] 首次出现处的整句 + 对应题录/摘要（纯函数）。
- `evaluateCitationClaimGrounding(input, judge)`：judge 可注入；生产 `createLLMClaimJudge()` 用 **verifier 角色** 批量判定 support / contradict / neutral（缺摘要/题录过短 → skip）。聚合 `ClaimGroundingReport`（supportRate / contradict 清单 / hint）。
- 契约：`contracts/citation-claim-grounding.ts`；单测：`src/__tests__/lib/citation-claim-grounding.test.ts`（fake judge，无 key）。
- 接入 `validate_citations`：**收口路径默认开**（`intentKind` 为 citation / citation_apply / abstract_finish / review_request / ap_full / pipeline_*；无 kind 时按 goal 正则回退；无 goal 的直接调用视为显式核查）。写节 / 综述起草（`draft` / `review_write`）的 reflect 自查**不跑**，避免每节烧 verifier。文献无摘要则 skip。`CITATION_CLAIM_GROUNDING=0`（或 `false`/`off`）全局关闭。失败（无 key/超时/解析失败）降级为 `claimGrounding: null`，不阻断主流程。结果并入 `data.claimGrounding`，summary 追加 `【claim 接地】`。contradict 是「可判定且确实错引」的强信号，供 Agent 优先改引/改写。

### bib_only 精确数据告警（软信号）

「仅书目」文献（无全文、无摘要）被正文标 [n] 且该句含精确数据（数字+单位 / 百分数 / 温度）时，数据无源可核。确定性规则，不调 LLM：

- `lib/agent/precise-data-grounding.ts`：`extractPreciseData`（正则只认「数字+单位」，天然排除年份/纯编号/纯小数，避免误伤「in 2020」「[3]」「3 篇文献」）+ `evaluateBibOnlyPreciseData`（扫全文，命中 bib_only + 精确数据 → 告警）。
- `lib/reference-mode.ts`：`resolveBibOnlyIndexes` / `resolveReferenceModes`，从 `source/route.ts` 抽离三态判定（full=知识库全文；abstract=有摘要；bib_only=仅书目）。性能折中：只对「无摘要」的文献查 `getFullText`。
- 接入 `validate_citations`：结果并入 summary（`【仅书目精确数据】`）+ `data.bibOnlyPrecise`。**软信号，不阻断 exportReady**。
- **导出前兜底（2026-08-17，W3-AP-BIB-EXPORT）**：`assessExportReadiness`（浏览器可导入）接受可选 `bibOnlyIndexes`；服务端 `assessExportReadinessAsync`（`export-readiness-server.ts`）解析 bib_only 后再检。`POST /api/export/readiness` 供 Word/PDF 客户端 toast。硬检仍只看 citation-gate 越界。

### 论文质量评测集（两把尺）

`lib/quality-eval/`：规则尺是 CI 地板（不调 LLM）；模型尺只给 `eval:quality` 做回归对照，**禁止**从 `write_section` / `toolsNode` 调用。

| 维度 | 检查 |
|------|------|
| structure 结构完整性 | 摘要≥150 / 引言≥400 / 结论≥150 + 主体节（方法/结果/讨论/综述正文）≥300 的数量 |
| citation 引用支撑 | 越界硬检（-40）+ 词重叠可疑占比（-≤60） |
| consistency 跨节一致性 | 结果有数值但结论没回扣 → 脱节风险；方法英文术语未在结果出现 → 脱节 |
| overclaim 结论语气克制 | overclaim 措辞扣分 vs hedge 加分 |

- 规则尺 `evaluateQuality(input)` 加权得 `overallScore`（引用支撑权重最高 0.35）；同步纯函数，可进 CI。
- 模型尺 `evaluateQualityLlm(input, judge?)`（`llm-judge.ts`）：verifier 角色，四维 citation_support / data_conclusion / overclaim / coherence；可注入 fake。无 key / 超时 / 解析失败 → `skipped`，不把脚本打红。`--no-llm` 只打规则分。
- golden fixtures：`lib/quality-eval/fixtures.ts`（好/坏样例）；单测 `quality-eval.test.ts` + `quality-llm-judge.test.ts`。
- 脚本：`npm run eval:quality`（`scripts/eval-quality.ts`，无参输出好/坏对比，可传 manifest.json）。

**注意**：词重叠/数值回扣是「代理信号」，claim 级 truthfulness 以 claim 接地为准；规则分用于「判断方向」，不做硬门禁。LLM 分与规则分不可直接比绝对值（量纲不同），只看改完后两把尺是否同向。

## 常用命令

- 质量评测：`npm run eval:quality`（规则分始终打印；有 verifier key 时加 LLM 分；`--no-llm` 只打规则）
- Agent 端到端剧本：`npm run eval:agent`（`src/lib/eval/agent-scripts.ts`，P1~P6 + FILE-READ 断言）
- 全量测试：`npx vitest run`（Agent 相关测试在 `src/__tests__/lib/agent-*.test.ts`、`src/__tests__/api/agent-*.test.ts`）
- 测试注意：Agent 接口用 `x-user-id` header 会 401（proxy 需 session cookie）；测试方式是 JWT_SECRET 签 token 作 cookie，或用真实域名登录。
