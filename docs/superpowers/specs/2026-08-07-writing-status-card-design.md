# 常驻写状态卡（WritingStatusCard）设计

- **日期**：2026-08-07
- **分支**：main
- **状态**：已批准（2026-08-07）
- **前置**：[2026-08-06-agent-write-progress-design.md](./2026-08-06-agent-write-progress-design.md)（Wave 1，`agent/progress` label 透传，已实现）
- **Wave 2 目标**：把「一行 label」升级为「结构化常驻写状态卡」，并一次修掉写链路 UI 断点审计中的 C1/C2/C3/H3/L3/M1

## 1. 背景与问题

Wave 1 已打通 `write_section` 执行期间 `agent/progress`（仅 `label: string`）的实时透传。但审计发现写链路仍有六处 UI 断点，且「full 模式 7 分钟干等无状态」由其中四个叠加而成：

| ID | 断点 | 根因 | 现象 |
|---|---|---|---|
| C2 | 检索阶段无进度 | `translateWritingEventToProgress` 只认 writing/verifying/refining，`status:"retrieving"` 落 `default:null` | 检索 30-60s 界面冻结 |
| C3 | 管道 `info` 事件全被吞 | `info` 类型落 `default:null` | 降级（检索超时/扩库）无感知 |
| H3 | Verifier 阶段 10-30s 卡死感 | 核查阶段只有静态 label，`verification` 流不转发 | 用户以为应用崩了 |
| L3 | Refiner 改写（`corrected_text`/`clear_result`）无提示 | 事件落 `default:null` | 不知文本正在被改写 |
| C1 | `data_claim_warnings` 事件消失 | `writing-runner.ts` 的 `collectWritingEvents` 与翻译层都不处理它 | 数据声明异常零警告 |
| M1 | 写失败无全局提示 | 管道 `error` 转工具失败，只有 action 卡红字 | 无 toast、无重试入口 |

### 目标
- full 模式写节等待期间，用户随时知道：写到哪个阶段、已生成多少字、耗时多久、有无降级/异常
- 写完成后有明确的收尾反馈（字数 + 核查结论），可展开核查报告
- 修复上表六个断点

### 非目标
- 并行只读批次归组（H1/H2，读链路）——另开
- `keyFindings` 填充（M2）、非 citations 工具的 `data` 透传（M3）——另开
- 进度持久化/续跑回放——与 Wave 1 一致，live-only

## 2. 事件契约扩展（`contracts/agent.ts`）

`agent/progress` 从 `{ label: string }` 扩展为结构化（`label` 保留，兼容既有消费方与 Wave 1 测试）：

```ts
export type WritingStage =
  | "retrieving" | "writing" | "verifying" | "refining" | "completed" | "error";

| {
    type: "agent/progress";
    label: string;            // 完整展示文案（保留，兜底）
    stage: WritingStage;      // 结构化阶段，驱动 stepper
    detail?: string;          // 阶段内细粒度文案（如「要点 2/4 完成」「已核查 7/15 条引用」）
    chars?: number;           // 已生成字符数（节流 1s 推送）
    elapsedMs?: number;       // 本工具已耗时
    info?: string[];          // 轻提示累积（降级/扩库/换验证商等）
    warnings?: string[];      // 数据声明异常（data_claim_warnings 累积）
  }
```

`WritingStage` 与管道 `SSEStatusEvent.status` 的关系：retrieving/writing/verifying/refining/completed 直接映射；`error` 由管道 `error` 事件映射。fast 模式只出现 writing→completed（前端 stepper 据此自动裁剪）。

## 3. 翻译层扩展（`lib/agent/writing-progress.ts`）

`translateWritingEventToProgress` 从「返回 `{ label } | null`」升级为「返回结构化状态对象」，内部 `state` 累积 `chars/info[]/warnings[]`：

| 管道事件 | → stage | detail |
|---|---|---|
| `status: "retrieving"` | `retrieving` | 检索文献中… |
| `status: "writing"` | `writing` | 生成初稿… |
| `delta`（≥1000ms 节流） | `writing` | 生成初稿… 已 {chars} 字 |
| `bullet_done` | `writing` | 要点 {i+1}/{n} 完成 |
| `pipeline_step`（step=verifying, running/done） | `verifying` | 加载引用原文 {n}/{m}… / 发现问题 N 条 |
| `status: "verifying"` | `verifying` | 自动核查中… |
| `verification`（流式 chunk） | `verifying` | 已输出 {n} 字（兜底：无 `〔进度 n/N〕` 标记时） |
| `verification_progress`（新） | `verifying` | 已核查 {n}/{N} 条引用 |
| `status: "refining"` | `refining` | 修正中… |
| `corrected_text` / `clear_result` | `refining` | 应用核查修正… |
| `status: "completed"` | `completed` | 完成 |
| `error` | `error` | 失败原因 |
| `info` | 保持当前 stage | 追加进 `info[]`（去重） |
| `data_claim_warnings` | 保持当前 stage | 追加进 `warnings[]` |

**关键**：C2/C3/L3/C1 的服务端事件原本就在发（`prepare-context.ts`、`verifier.ts`、`refiner.ts`、`finalize.ts`），仅翻译层不认——此层放开即修复，服务端零改动。

## 4. 服务端补发（仅两处）

### 4.1 新事件 `verification_progress`（修 H3 逐条计数）

Verifier 的 AI 核查是单次流式 LLM 输出，内部逐条核查拿不到原生信号。方案：**流内打进度标记**。

1. `buildVerifierSystemPrompt("full", ...)` 追加指令：「开始核查每条引用前，先输出一行 `〔进度 n/N〕`」
2. `verifier.ts` 流式循环（现 line 123-128）解析 `〔进度 n/N〕` 正则 → 命中即 `emit({ type: "verification_progress", checked: n, total: N })`
3. `WritingSSEEvent` 联合类型新增 `verification_progress`（`contracts/sse.ts`）
4. **稳健兜底**：流内始终无标记（模型不遵循）→ 翻译层按 `verification` chunk 累计字符数显示「已输出 N 字」，两条路都保证卡片在动

verifying 阶段卡片显示两段子进度：**加载引用原文 N/M → 已核查 n/N 条**（前者 `pipeline_step` 已发射，现纳入映射）。

### 4.2 M1 错误处理

管道 `error` 事件 → 翻译层 `stage:"error"` + 失败原因 label → 前端卡片红态 + 「重试」按钮（重新 `sendGoal`）。**不**发 `agent/error`（会中断整轮 agent，过重）。

## 5. 前端

### 5.1 `hooks/use-agent.ts` 新增 `writeStatus` 状态

```
writeStatus: {
  section: string;        // 章节显示名
  stage: WritingStage;
  detail?: string;
  chars: number;
  elapsedMs: number;
  info: string[];
  warnings: string[];
  done?: { chars: number; issueCount: number; passed: boolean; verification?: string };
  error?: string;
} | null
```

生命周期：
- `agent/action`（tool=`write_section`）→ 从 `params.section` 初始化 `{ section, stage:"retrieving", chars:0, elapsedMs:0, info:[], warnings:[] }`
- `agent/progress` → merge（`info[]/warnings[]` 累积去重，`chars/elapsedMs/stage/detail` 覆盖）
- `agent/observation`（tool=`write_section`）→ 定稿：成功 `stage:"completed"` + `done`（从 `result.data` 取 chars/issueCount）；失败 `stage:"error"` + `error`
- `agent/complete` / `agent/error` → 清空 `writeStatus`（回合结束，摘要行随回合消失）

### 5.2 新组件 `WritingStatusCard`（`components/shared/agent/writing-status-card.tsx`）

钉在消息区顶部、顶栏下方（`agent-panel.tsx` header 之后），聊天滚动不影响可见性。

- **阶段 stepper**：`检索 → 初稿 → 核查 → 修正 → 完成`；fast 模式自动裁剪为 `初稿 → 完成`（按进入过的 stage 集合渲染）
- **统计行**：`已 {chars} 字 · {MM:SS}`（`elapsedMs` 起步 + 本地每秒 tick，静态标签也跳秒，消除冻结感）
- **info 提示条**：`info[]` 逐条渲染小字提示（如「已扩大全库检索」「检索超时，用基础上下文继续」）
- **warnings 条**：`warnings[]` 渲染 ⚠ 数据声明异常
- **完成态**（`stage:"completed"`）：收成一行 `✓ 已写回 {section} · {chars} 字 · 核查通过`，点击展开核查报告（issues 列表 / `verification` 文本）
- **错误态**（`stage:"error"`）：红框 + 原因 + 「重试」按钮（`agent.sendGoal(最近目标)`）

## 6. 错误与边界

- **取消**：`ctx.signal` 中止传播不变；`agent/cancel` 清 `writeStatus`（并入 reset/startNewChat）
- **`emitLiveEvent` 未定义**（测试直调）：翻译层 no-op，行为与现状一致
- **兼容**：`label` 字段保留，Wave 1 的既有测试与消费路径不破坏；旧事件无新字段时 `stage` 缺失 → 前端回退显示 `label`
- **不持久化**：续跑/刷新不回放写状态

## 7. 测试

| 层 | 内容 |
|---|---|
| 翻译层单测（扩 `agent-writing-progress.test.ts`） | retrieving/info/verification_progress/corrected_text/error/data_claim_warnings 各 stage 映射；info/warnings 累积去重；无标记回退字符数 |
| 契约测试 | `agent/progress` 新字段类型；`verification_progress` 事件类型 |
| 组件测试（新） | WritingStatusCard：stepper 高亮与 fast 裁剪 / 完成摘要行 / 错误态重试 / info 提示条 |
| hook 测试（扩） | `use-agent` 生命周期：action 初始化 → progress merge → observation 定稿 → complete 清空 |
| 既有测试 | `agent-ui-progress.test.ts`、Wave 1 `writing-progress` 相关保持通过 |

## 8. 改动文件清单

- `src/contracts/agent.ts`（`agent/progress` 结构化 + `WritingStage`）
- `src/contracts/sse.ts`（`verification_progress` 事件）
- `src/lib/agent/writing-progress.ts`（翻译层结构化，返回对象 + state 累积）
- `src/lib/agent/tools/write-section.ts`（翻译返回值透传，emit 结构化 `agent/progress`）
- `src/lib/agent/prompts.ts`（verifier prompt 加 `〔进度 n/N〕` 指令）
- `src/app/api/writing/pipeline/verifier.ts`（解析标记 → emit `verification_progress`）
- `src/hooks/use-agent.ts`（`writeStatus` 状态 + 生命周期）
- `src/components/shared/agent/writing-status-card.tsx`（新组件）
- `src/components/shared/agent/agent-panel.tsx`（渲染卡片 + 移除/降级原 `AgentWorkingIndicator` 写进度职责）
- 对应测试文件
- 文档：`docs/domain/agent.md` 同步

## 9. 影响面

- **SSE 契约改动**：发射方仅 `write-section.ts` 一处（`ctx.emitLiveEvent`），消费方仅 `use-agent.ts` 一处——收敛
- **`AgentWorkingIndicator`**：写进度职责移交 WritingStatusCard；非写场景（思考/执行中的通用指示）仍保留
- **git 注意**：设计文档提交时**只含本文件与 docs/DEPLOY.md**；工作树中 `goal-intents.ts`/`reflect.ts` 等既有 WIP 改动**不混入**
