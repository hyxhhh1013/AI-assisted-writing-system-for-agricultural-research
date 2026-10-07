# W3-AP-PHASE-MACHINE — Agent 阶段制改造（PR 计划表）

> **状态**：规划生效（2026-10-04）；§9 D1–D6 **已拍板**。PHASE-00、01、02、03、WALL-R 已落地（2026-10-07）；enforce / 删门禁 / 状态卡仍待影子期，不得跳过。
> **挂载**：队列 **Phase 20 `W3-AP-PHASE-*` / `W3-AP-WALL-*`**；实时 status 只看 [`ENGINEERING_OPTIMIZATION_QUEUE.md`](../ENGINEERING_OPTIMIZATION_QUEUE.md) §1。
> **对照图**：Cursor 画布 `agent-phase-architecture.canvas.tsx`（现在 vs 阶段制、门禁去向、迁移步骤）。
> **不换** LangGraph，**不加**热路径 LLM 分类/评委，**不推倒重写**。
> **产品决策（已拍板，实现不得另议）**：蓝图确认并入大纲阶段；综述起草可检索导入、研究型不可；意图明确才临时切阶段，不明确就问；影子放行须文献 ≥30 轮、误拦 <5%、无阶段算错；墙上限出图 3 / 逐篇读 6 / 连搜 6 / 门禁回弹 2；切阶段导致提示缓存失效可接受，上线后观察一周用量。

---

## 0. 一句话

现在模型每轮拿到约 45 个工具自己挑，代码在外面用 20 道门禁拦、用 5 种续跑催、用 18 个正则猜意图，转圈和「改一处坏一处」都出自这两边打架。
改成：**代码先定「现在在哪一步」，只把这一步的工具交给模型；撞墙后下一步由代码决定。** 模型只管格子里的事：搜什么词、怎么写、参数怎么填。

阶段定义其实已有：`contracts/phase-task-pack.ts` 的 `PHASE_TASK_PACKS`（0–7，含 `preferredTools`）。现在只当文字塞进简报与 `inspect_project` 返回，没用来限制工具。本计划就是让它「长出牙」。

---

## 1. 为什么现在做（证据）

### 1.1 线上转圈基线（2026-10-04，`scripts/harvest-agent-loop.py`，库内全部 18 会话 / 239 轮）

| 病码 | 会话数 | 说明 |
|------|--------|------|
| `search_no_gain` | 12 | 一轮搜 ≥4 次且没成功导入（含误报：导入要确认，成功落在下一轮） |
| `search_storm` | 8 | 一轮 `search_*` ≥6 次，本地/外部来回切 |
| `same_call` / `long_turn` | 2 / 2 | 同参数重复；一轮 >16 个工具（如逐篇 `read_reference` ×17） |
| `ping_pong` | 1 | `draft_mechanism_figure ↔ read_figure` 一轮 3 次 + 下一轮 6 次 = 9 张图 |
| `stuck_running` | 2 | running 超过 1 小时无更新 |
| `antispam_break` / `forced_stop` | **0** | 熔断一次没触发：转圈的读、搜、出图恰好都被熔断豁免 |

### 1.2 结构性数字

| 项 | 数 |
|----|----|
| `nodes.ts` | 1578 行；`toolsNode` 一个函数管门禁/确认/执行/配图/写节断点/检查点 |
| `goal-intents.ts` | 1467 行；18 个 `isXxxGoal` + 14 个 `checkXxxGate` |
| `nodes.ts` 内 `role: "user"` 注入 | 31 处（含正常工具结果；催促类约十余处，见附录 D） |
| 「不许结束」路径 | `agentNode` 4 条 + `routeAfterAgent` 3 条 + reflect |
| 「下一步」计算 | 4 份：`suggestNextAgentActions`、`resolvePhaseTaskPack`、`continue-hint.ts`、`agent-panel.tsx` |

---

## 2. 目标与非目标

### 目标（全部完成时同时成立）

1. 「当前阶段 / 下一步」全仓只有一个函数算（`resolveAgentPhase`）。
2. 模型每轮只拿到「本阶段工具 + 常驻只读工具」。
3. 控制指令走每次重算、替换式的「状态卡」，不再往对话历史追加 `System:` 催促。
4. 撞墙（质检连败、连搜、逐篇读、门禁二次回弹、空转）统一走 `wall-policy.ts`，输出四选一：直接调工具 / 只许用某工具 / 停下给选项 / 提示。
5. 「什么时候停」由「本阶段完成条件」一个判断决定，替代计划续跑、意图续跑、reflect。
6. 意图判断只回答「用户想跳到哪个阶段」。
7. 线上 harvest：`search_storm`、`long_turn`、`ping_pong` 会话占比较基线下降一半以上；无新增病码。

### 非目标

| 不做 | 原因 |
|------|------|
| 换掉 LangGraph / 重写图拓扑 | 图本身不是问题 |
| 热路径 LLM 意图分类、LLM 评委 | 已有共识：规则尺进 CI，模型尺只进评测 |
| 全自动八阶段 Conductor | 产品定位仍是「每步等人」（HITL-STEER） |
| 一次性删光门禁 | 每删一道都要先证明不可达（§3 规则 3） |
| 改写节管道 / WRITE-QA | 与本主轴无关，最稳的一块不动 |

---

## 3. 安全网（所有 PR 必须遵守）

### 规则 1：改行为的 PR 一律带开关，默认关

| 环境变量 | 取值 | 管什么 | 引入于 |
|----------|------|--------|--------|
| `AGENT_PHASE_MODE` | `off`（默认）/ `shadow` / `enforce` | 阶段工具过滤总开关 | PHASE-04 |
| `AGENT_PHASE_ENFORCE` | 逗号分隔阶段名，如 `literature,draft` | `enforce` 时哪些阶段真生效 | PHASE-08 |
| `AGENT_PHASE_CARD` | `0`（默认）/ `1` | 状态卡注入 | PHASE-05 |
| `AGENT_PHASE_DONE` | `off`（默认）/ `shadow` / `on` | 完成条件替代续跑 | PHASE-13 |

读取统一放 `lib/agent/core/phase-flags.ts`（仿 `citation-claim-policy.ts` 的解析方式），**禁止**在业务代码里散读 `process.env`。线上出问题：改环境变量重启即回旧逻辑，不回滚代码。

### 规则 2：先影子，后生效

阶段过滤、完成条件这两类高风险改动，先以 `shadow` 跑：照旧执行，只在 `toolTrace` 记一条「如果生效会怎样」。harvest 统计误拦后，修正阶段/工具集，再切 `enforce`。

### 规则 3：旧门禁先不删

新旧两层并存。删一道旧门禁的前提：
1. 对应阶段已 `enforce` 上线 ≥1 周；
2. 有单测证明：在该阶段工具集下，该门禁拦的工具根本不会出现在模型可选列表里；
3. harvest 期间该门禁 `pre-gate` 拦截计数为 0。

### 规则 4：每个改行为的 PR 都有前后对比

合并前在服务器跑 `harvest-agent-loop.py --json` 存基线；上线 ≥3 天或 ≥20 轮后再跑一次对比。病码不降或出现新病码 → 关开关回退，查原因。

### 规则 5：本地先用

改行为的 PR 先在本地 `npm run dev` 用真实项目走一遍「找文献 → 大纲 → 蓝图 → 写一节 → 查引用」主线，再部署。

### 每个 PR 的合并清单

- [ ] `npx tsc --noEmit`、相关 `vitest`、`npm run eval:agent` 全绿
- [ ] 不改行为的 PR：写「锁现状」的特征测试（重构前先写、重构后仍绿）
- [ ] 改行为的 PR：有开关、默认关、`off` 路径与改动前逐行等价
- [ ] `docs/domain/agent.md` 同步；队列 §1 状态 + §4 日志
- [ ] 改了 `contracts/agent-session.ts` 快照字段 → `session-snapshot.ts` 双向映射 + 旧快照兜底
- [ ] 改行为的 PR：harvest 前后对比记录贴在 §4 日志

---

## 4. 术语

| 词 | 意思 |
|----|------|
| 阶段 phase | `literature / outline / draft / citation / abstract / review` + `config`、`diagnose`（只读诊断）。对应 `PHASE_TASK_PACKS` 0–7；**D1 已拍板**：阶段 3「蓝图确认」并入 `outline`（小步 `outline → blueprint`） |
| 小步 subStep | 阶段内的先后顺序，如文献阶段 `local → external → import` |
| 常驻工具 | 每个阶段都给的只读工具：`inspect_project`、`read_section`、`read_project_asset`、`list_references`、`read_reference`、`recall_recent_work`、`update_work_memory`、`ask_user`、`read_attachment`、`list_attachments`、`read_figure` |
| 状态卡 | 每次调模型时临时拼的一条消息：当前阶段 / 下一步 / 不能做 / 本轮信号。不进 `state.messages` |
| 本轮信号 turnSignals | 原先以 `System:` 追加的催促，改为结构化信号存状态，渲染进状态卡；用户新消息时清空 |
| 撞墙 wall | 门禁拒绝、质检不过、连搜、逐篇读、空转等。由 `wall-policy.ts` 决策 |

---

## 5. PR 总表

风险：低 = 不改行为或纯数据；中 = 改行为但可逆且影响面小；高 = 改模型可用工具或停止时机。

### 轨道 A：阶段制主线

| ID | 标题 | 依赖 | 估时 | 风险 | 改行为 | 开关 | 状态 |
|----|------|------|------|------|--------|------|------|
| PHASE-00 | 撞墙出口 `wall-policy.ts` + 出图重画上限 + 转圈扫描脚本 | — | 0.5d | 中 | 是 | 无（上限=3） | **done** 2026-10-04 |
| PHASE-01 | harvest：`--json` 基线 / `--compare` 对比 / 新病码 | 00 | 0.5d | 低 | 否 | — | **done** 2026-10-07 |
| PHASE-02 | `resolveAgentPhase` 单一来源（4 处「下一步」合一） | — | 1.5d | 低 | 否 | — | **done** 2026-10-07 |
| PHASE-03 | 阶段工具集数据表 `PHASE_TOOLSETS`（只定义不使用） | 02 | 0.5d | 低 | 否 | — | **done** 2026-10-07 |
| PHASE-04 | 影子模式：记录「阶段制会不会拦这次调用」 | 01, 03 | 1d | 低 | 否（只记录） | `AGENT_PHASE_MODE=shadow` | todo |
| PHASE-05 | 状态卡通道（只新增，不删旧催促） | 02 | 1d | 中 | 轻 | `AGENT_PHASE_CARD` | todo |
| PHASE-06a | 催促迁移第 1 批：出图 / 插入回看 / 文生图（5 处） | 05 | 1d | 中 | 是 | `AGENT_PHASE_CARD` | todo |
| PHASE-06b | 催促迁移第 2 批：计划 / 意图 / 口头宣布 / 熔断（4 处） | 06a | 1d | 中 | 是 | `AGENT_PHASE_CARD` | todo |
| PHASE-07 | **决策点**：影子数据评审（无代码） | 04 上线 ≥2 周 | 0.5d | — | — | — | todo |
| PHASE-08 | 文献阶段 enforce（按阶段给工具 + 跨阶段临时切换） | 07, WALL-R | 1.5d | 高 | 是 | `AGENT_PHASE_ENFORCE=literature` | todo |
| PHASE-09 | 文献阶段收尾：小步顺序 + 删已不可达门禁 | 08 上线 ≥1 周 | 1d | 中 | 是 | 同上 | todo |
| PHASE-10 | 起草阶段 enforce + 收尾 | 09 | 2d | 高 | 是 | `…,draft` | todo |
| PHASE-11 | 引用阶段 enforce + 收尾 | 10 | 1.5d | 高 | 是 | `…,citation` | todo |
| PHASE-12 | 摘要 / 审查 / 诊断阶段 enforce + 收尾 | 11 | 1.5d | 中 | 是 | `…,abstract,review,diagnose` | todo |
| PHASE-13a | 完成条件影子：新旧「该不该停」对比记录 | 12 | 1d | 低 | 否 | `AGENT_PHASE_DONE=shadow` | todo |
| PHASE-13b | 完成条件生效：替代计划续跑 / 意图续跑 / reflect | 13a 上线 ≥1 周 | 2d | 高 | 是 | `AGENT_PHASE_DONE=on` | todo |
| PHASE-14 | 意图收口为入口路由；删无引用 `isXxxGoal` | 13b | 1.5d | 中 | 是 | — | todo |
| PHASE-15 | 清理：删 `off` 旧路径、拆 `toolsNode`、文档收口 | 14 上线 ≥2 周 | 2d | 中 | 否 | 移除开关 | todo |

### 轨道 B：撞墙策略扩展（可与 A 并行，WALL-R 起步）

| ID | 标题 | 依赖 | 估时 | 风险 | 改行为 | 状态 |
|----|------|------|------|------|--------|------|
| WALL-01 | 出图质检连败 3 次 → 选项卡 | — | — | 中 | 是 | **done**（= PHASE-00） |
| WALL-R | `restrict` 决策落地：下一轮只许用指定工具 | 00 | 1d | 中 | 是（仅被调用时） | **done** 2026-10-07 |
| WALL-02 | 逐篇读上限：一轮 `read_reference`/`read_section` ≥6 | WALL-R | 0.5d | 中 | 是 | todo |
| WALL-03 | 检索墙：连搜无新增 → 弹导入确认或问用户 | WALL-R | 1d | 中 | 是 | todo |
| WALL-04 | 门禁二次回弹 → 只许用门禁点名的工具 | WALL-R | 1d | 中 | 是 | todo |
| WALL-05 | 空转熔断 → 选项卡（不再 `agent/error` 硬停） | WALL-R | 0.5d | 中 | 是 | todo |
| WALL-06 | 孤儿 running 会话回收（`stuck_running`） | — | 0.5d | 低 | 是 | todo |

### 时间线（单人 + AI，约 9 周）

| 周 | 日期 | 做什么 | 上线后状态 |
|----|------|--------|------------|
| W1 | 10/05–10/11 | PHASE-01、02、03；WALL-R | 线上行为不变 |
| W2 | 10/12–10/18 | PHASE-04（上线 shadow）；WALL-02、03 | 开始收影子数据 |
| W3 | 10/19–10/25 | PHASE-05、06a；WALL-04、05、06 | 本地开状态卡；线上继续 shadow |
| W4 | 10/26–11/01 | PHASE-06b；状态卡线上开 | 影子数据满 2 周 |
| W5 | 11/02–11/08 | PHASE-07 评审 → PHASE-08 | 文献阶段 enforce |
| W6 | 11/09–11/15 | PHASE-09、10 | 起草阶段 enforce |
| W7 | 11/16–11/22 | PHASE-11、12 | 全阶段 enforce |
| W8 | 11/23–11/29 | PHASE-13a → 13b | 完成条件生效 |
| W9 | 11/30–12/06 | PHASE-14；观察 | 意图收口 |
| W11+ | 12/14 起 | PHASE-15 | 删开关、清旧路径 |

任一周 harvest 变差：本周不前进，先修或回退。时间线允许整体顺延，**不允许跳过影子期**。

---

## 6. 分 PR 任务单

### PHASE-00 ✅ 撞墙出口 + 出图重画上限 + 扫描脚本（done 2026-10-04）

已合入（未提交前以工作区为准）：
- `src/lib/agent/core/wall-policy.ts`：`decideAfterWall` / `AGENT_WALL_LIMITS.figure_qa=3`
- `src/lib/agent/figure-loop.ts`：`countFigureQaFailsThisRun`、`pendingFigureRedraw`、`isFigureQaFailObservation`、`latestFigurePlotHref`
- `nodes.ts` / `parallel-tools.ts` / `state.ts`：三处强制重画到墙让路，弹 `clarify` 选项卡；轨迹 `figure_qa_wall`
- `scripts/harvest-agent-loop.py`；单测 `agent-wall-policy.test.ts`（12 例）
- 待办：部署后页面验证「选 1 先用这版」能正常收尾、不再自己画

---

### PHASE-01 harvest 基线与对比（0.5d，低风险）

**目标**：每个改行为的 PR 都能拿出「改前 / 改后」两份数字。

**改动**：只动 `scripts/harvest-agent-loop.py`。
1. `--json PATH`：把「病码 × 会话数 / 轮数」「门禁拦截原因 Top」「状态分布」写成 JSON。
2. `--compare BASE.json`：打印每个病码的变化（会话占比、轮数），变差的标 `WORSE`。
3. `--since YYYY-MM-DD`：只看某日期之后更新的会话（上线后对比用）。
4. 新病码：
   - `figure_qa_wall`：轨迹出现该条（PHASE-00 已写入）
   - `phase_shadow_block`：轨迹 `via=phase-shadow`（PHASE-04 后才会有），按「阶段 × 工具」聚合
   - `wall_*`：轨迹 `via=wall` 按 `tool` 聚合（WALL 系列）
5. 修 `search_no_gain` 误报：导入成功落在下一轮（用户确认后）时，下一轮首个 `import_reference` 成功也算本轮有收获。

**测试**：脚本无单测；在服务器跑一次 `--json /tmp/base-2026-10-05.json`，再 `--compare` 自己，应全部为 0 变化。

**验收**：基线文件存服务器 `/home/ubuntu/agent-loop-baselines/`；§4 日志记录基线数字。

**回滚**：脚本独立，不影响线上。

---

### PHASE-02 `resolveAgentPhase` 单一来源（1.5d，低风险，不改行为）

**目标**：「现在在哪一步、下一步干嘛」全仓只算一份。为后面所有 PR 打地基。

**现状（4 份）**：
| 位置 | 算什么 |
|------|--------|
| `lib/agent/project-briefing.ts` `suggestNextAgentActions` | 按阶段互斥给一句主建议 |
| `lib/agent/phase-task-pack.ts` `resolvePhaseTaskPack` | 取 `snapshot.currentPhase` + 主建议 → 简报附加段 |
| `lib/agent/continue-hint.ts` `resolveAgentContinueHint` | 续跑条：本轮信号 + 下一空节 |
| `components/shared/agent/agent-panel.tsx` L236/L252/L376 | 前端芯片又调一遍上面两个 |

**做法**：
1. **先写特征测试**（`src/__tests__/lib/agent-phase-characterization.test.ts`）：取 15～20 个项目快照样例（无文献 / 有文献无大纲 / 有大纲无蓝图 / 蓝图齐引言空 / 引言写完 / 全文写完无摘要 / phase 7 …，综述与研究型各一套），记录**当前** `suggestNextAgentActions`、`resolvePhaseTaskPack().goal`、`resolveAgentContinueHint` 的输出。重构前跑绿。
2. 新增 `src/contracts/agent-phase.ts`：
   ```ts
   export type AgentPhaseId =
     | "config" | "literature" | "outline" | "draft"
     | "citation" | "abstract" | "review" | "diagnose";
   export interface AgentPhaseState {
     phase: AgentPhaseId;
     /** 对应 PHASE_TASK_PACKS 编号（兼容旧逻辑） */
     packPhase: number;
     subStep?: string;
     /** 唯一主建议（原 suggestNextAgentActions[0]） */
     nextAction: string | null;
     /** 下一个要写的节（起草阶段） */
     nextSectionKey?: string | null;
     /** 完成条件的人话描述（状态卡与 UI 用） */
     doneWhen: string;
   }
   ```
3. 新增 `src/lib/agent/core/agent-phase.ts`：`resolveAgentPhase({ snapshot, intentKind, writeEnabled }) → AgentPhaseState`。内部**搬运**现有逻辑（`writeTargetOf`、`evaluateDraftCoverage` 调用、阶段互斥分支），不改判断条件。**D1**：对外 `phase` 只有 `outline`，没有独立 `blueprint`；`packPhase` 仍可返回 2 或 3，给旧 `PHASE_TASK_PACKS` 用。本 PR 不改芯片/续跑条文案（特征测试锁现状）。
4. 改调用方：`suggestNextAgentActions` 变成 `resolveAgentPhase(...).nextAction` 的薄包装（保留导出名，避免大面积改调用）；`resolvePhaseTaskPack` 内部改用它；`agent-panel.tsx` 改用新函数（前端可 import 纯函数，无 fetch）。
5. `continue-hint.ts` 只把「下一空节」那部分改为读 `nextSectionKey`；本轮信号逻辑不动。

**不做**：不改任何判断条件；不碰 `toolsNode`；不加开关（不改行为）。

**测试**：特征测试全绿；`agent-project-briefing.test.ts`、`agent-phase-gates.test.ts` 全绿；`eval:agent` 全绿。

**验收**：`rg "suggestNextAgentActions\(" src` 只剩薄包装内部与测试；四处界面文案与改前一致（本地点开工作台 Agent Tab 看芯片、续跑条）。

**回滚**：`git revert`。

**文档**：`agent.md` 关键文件表加 `core/agent-phase.ts`；「下一步唯一叙事」段落改指向新函数。

---

### PHASE-03 阶段工具集数据表（0.5d，低风险，不改行为）

**目标**：把「每个阶段给哪些工具」写成可测试的数据，先不用。

**做法**：
1. `src/contracts/agent-phase.ts` 增加：
   ```ts
   export const ALWAYS_ON_TOOLS: readonly string[];          // §4 常驻工具
   export const PHASE_TOOLSETS: Record<AgentPhaseId, {
     tools: readonly string[];
     /** 综述 / 研究型差异，如综述起草允许 search_knowledge */
     byMode?: Partial<Record<"review" | "research", readonly string[]>>;
     /** 阶段内小步（PHASE-09 起使用） */
     subSteps?: Array<{ id: string; tools: readonly string[]; until: string }>;
   }>;
   export function toolsForPhase(phase: AgentPhaseId, mode?: string): string[];
   ```
2. 初版取值见附录 A（以 `PHASE_TASK_PACKS.preferredTools` 为底，补齐配图、修订等）。**D2 已拍板**：`draft.byMode.review` 含 `search_knowledge`、`import_reference`；`draft.byMode.research` 不含检索/导入。

**测试**（`agent-phase-toolsets.test.ts`）：
- 注册表 `createAgentTools()` 里每个工具至少出现在一个阶段或常驻集合（防止某工具永远拿不到）。
- 每个阶段的 `PHASE_TASK_PACKS[n].preferredTools` ⊆ `toolsForPhase(...)`。
- `toolsForPhase` 结果无重复、全部是注册表里存在的工具名。

**验收**：测试绿；附录 A 表与代码一致。

**回滚**：纯数据，`git revert`。

---

### PHASE-04 影子模式（1d，低风险，只记录）

**目标**：不改任何行为，量出「阶段制如果生效，会拦掉哪些模型的选择」。

**做法**：
1. `src/lib/agent/core/phase-flags.ts`：`readPhaseMode(): "off" | "shadow" | "enforce"`、`readEnforcedPhases(): Set<AgentPhaseId>`、`readPhaseCardEnabled()`、`readPhaseDoneMode()`。非法值按 `off`。
2. `contracts/agent-session.ts`：`AgentToolTraceVia` 增加 `"phase-shadow" | "phase" | "wall"`。
3. 每轮（`run-graph.ts` 初始化 / 跟聊时）算一次 `resolveAgentPhase`，存进 `AgentContext.phaseState`（不进快照）。项目刷新（`refreshAgentProjectContext`）后重算。
4. `toolsNode` 和 `runParallelReads` 在门禁之前：`mode === "shadow"` 且工具 ∉ `toolsForPhase(phase) ∪ ALWAYS_ON` → `trace(tool, true, { via: "phase-shadow", reason: \`phase=${phase} 不含 ${tool}\` })`。**继续执行**，不拦。
5. harvest（PHASE-01 已支持）聚合 `phase_shadow_block`。

**测试**：
- `phase-flags` 解析单测（含非法值）。
- `toolsNode` 单测：shadow 时被标记的工具照常执行、轨迹多一条 `phase-shadow`；`off` 时轨迹与改前一致。

**上线**：生产设 `AGENT_PHASE_MODE=shadow`。

**验收**：线上跑 1 天后 harvest 能看到 `phase_shadow_block` 分布；无用户可见变化。

**回滚**：`AGENT_PHASE_MODE=off`。

---

### PHASE-05 状态卡通道（1d，中风险，只新增）

**目标**：建一条「替换式」的控制通道，先和旧催促并存。

**做法**：
1. `src/lib/agent/core/phase-card.ts`：`buildPhaseStateCard({ phaseState, turnSignals, intentKind }) → LLMMessage | null`。格式固定、短（≤600 字）：
   ```text
   【当前状态（系统，每轮更新；与历史中的旧提示冲突时以此为准）】
   阶段：起草（写作蓝图已批准）
   下一步：写「引言」并保存到当前项目
   完成条件：用户点名的那一节写回且质检通过，然后停下问下一节
   本阶段不要：检索新文献、写摘要
   本轮提示：（turnSignals，见 06a/06b）
   ```
2. `agentNode`：`AGENT_PHASE_CARD=1` 时，在简报消息之后、历史之前插入状态卡（与 `buildAgentBriefingMessage` 同样不写入 `state.messages`）。
3. 系统提示（`prompts.ts`）加一句：「标有【当前状态】的消息是系统每轮重算的，优先于对话历史里更早的系统提示。」仅在开关开时加。
4. `phaseGatePromptRules()` 不动（PHASE-15 再收）。

**测试**：`phase-card.test.ts` 快照测各阶段渲染；`agentNode` 单测：开关开时 LLM 收到的 messages 含状态卡、`state.messages` 不含。

**验收**：本地开 1 天，走主线无异常；`eval:agent` 绿。

**回滚**：`AGENT_PHASE_CARD=0`。

---

### PHASE-06a 催促迁移第 1 批：出图类（1d，中风险）

**目标**：出图相关的 `System:` 追加改为本轮信号，渲染进状态卡。

**做法**：
1. 状态加 `turnSignals: Array<{ code: string; text: string; at: number }>`（`state.ts` Annotation，reducer：追加 + 按 `code` 去重保留最新；用户新消息时清空）。快照持久化（检查点续跑要带上）。
2. 迁移以下注入（`nodes.ts`，行号以 2026-10-04 为准）：
   | 现位置 | code | 内容 |
   |--------|------|------|
   | ~1262 机理图自动排队 QA 提示 | `figure_qa_queued` | 已排队识图质检 |
   | ~1299 / ~1309 质检 block 重出 | `figure_block` | 按 findings 改 Spec 重出 |
   | ~1338 未进正文 | `insert_missing` | 已生成但正文没有，带 sectionKey 重插 |
   | ~1353 回看失败 | `insert_unverified` | read_section 核对 |
   | ~1364 文生图候选 | `illustrate_pending` | 候选待人选，禁止自动插入 |
   | ~1378 识图要重画 | `figure_regen` | 必须 replaceImageUrl |
3. 开关关时走原 `newMessages.push`；开时只写 `turnSignals`。用一个 helper `emitSteer(code, text)` 统一两条路径，避免每处写 if。
4. 信号消费后清除规则：`figure_regen` 在下一次出图成功后清；`insert_*` 在插入验证通过后清；其余随用户新消息清。

**测试**：每个 code 一条单测：开关开 → `state.messages` 不新增、`turnSignals` 有该 code、状态卡含文案；开关关 → 与改前一致。

**验收**：本地出一张机理图（含一次质检不过）、一张数据图、一次文生图候选，行为与改前一致；历史里不再出现这些 `System:` 行。

**回滚**：`AGENT_PHASE_CARD=0`。

---

### PHASE-06b 催促迁移第 2 批：续跑类（1d，中风险）

**迁移**：
| 现位置 | code | 备注 |
|--------|------|------|
| ~428 出图续跑 `buildFigureQaContinueNudge` | `figure_continue` | PHASE-00 后已受墙约束 |
| ~438 计划续跑 `buildContinueNudge` | `plan_continue` | |
| ~447 意图续跑 `pickIntentNudge` | `intent_continue` | |
| ~456 口头宣布 `buildAnnounceToolNudge` | `announce_tool` | |
| ~1433 antispam 软中断 | `antispam` | WALL-05 后可能改为选项卡 |

**注意**：续跑类信号会让模型「再跑一轮」。迁到状态卡后，`updates.finished=false` 的判断**不变**，只换提示的载体。PHASE-13b 才动停止逻辑。

**测试 / 验收 / 回滚**：同 06a。额外跑 `agent-plan-progress.test.ts`、`agent-reflect.test.ts`、`agent-langgraph.test.ts`。

---

### PHASE-07 决策点：影子数据评审（0.5d，无代码）

**前提**：PHASE-04 线上 shadow ≥2 周，且文献阶段 ≥30 轮（不够就延长，或你本地多走几遍）。

**评审内容**（harvest `phase_shadow_block` 按阶段 × 工具）：
1. 被影子拦的调用里，属于已知转圈（连搜、逐篇读、岔路）的占多少 → 越高越好。
2. 属于正常操作的（例：写引言时合理查一篇文献）列出来 → 每条要么补进阶段工具集，要么归入「跨阶段临时切换」。
3. 阶段算错的会话（例：明明在写节却判成文献阶段）→ 修 `resolveAgentPhase`。

**放行门槛（D4 已拍板，缺一不可）**：文献阶段 ≥30 轮（不够就延长影子期，或本地按清单补样本）；被拦调用中「正常操作」<5%；无阶段算错。达不到则 PHASE-08 不开。

**产出**：§4 日志一段结论 + 工具集修正 PR（若有）。

---

### PHASE-08 文献阶段 enforce（1.5d，高风险）

**目标**：文献阶段只给文献工具。第一个真正改模型可选工具的 PR。

**做法**：
1. `agentNode`：`mode=enforce` 且当前阶段 ∈ `AGENT_PHASE_ENFORCE` 时，传给 LLM 的 `tools` 过滤为 `toolsForPhase(phase) ∪ ALWAYS_ON`。
2. `toolsNode` 兜底：模型仍调了集合外工具（幻觉或旧快照里的 pending）→ 不执行，`trace(tool, false, { via: "phase" })`，写一条 observation「本阶段没有这个工具」，并交 `decideAfterWall`（第 2 次起由代码决定）。
3. **跨阶段临时切换（D3 已拍板）**：入口意图**明确**指向另一阶段（如在文献阶段说「写引言」）→ 本轮按目标阶段给工具，状态卡写明「临时切到起草，做完回到文献」。意图**不明确**（一句话可能跨两步、或只说「继续」）→ `ask_user` 问清，禁止静默切。复用 `classifyIntent`，不加新正则。
4. 检查点 / 确认续跑：`pendingToolCalls` 里已有的调用照常执行（用户已批准过），不受过滤。
5. 前缀缓存（D6 已拍板）：切阶段时工具列表会变、提示缓存可能失效，**接受费用**。记录 `agent/status` 里阶段切换次数；enforce 上线后观察一周 DeepSeek 用量，用量异常再把常驻工具排前或收紧切阶段频率，**不回头改成「永远全量工具」**。

**测试**：
- 假 LLM 捕获 `tools` 参数：文献阶段只含文献 + 常驻工具；`off` / `shadow` 时为全量。
- 集合外调用被拒、轨迹 `via=phase`、第 2 次触发墙。
- 跨阶段：文献阶段 + 「写引言」→ 本轮含 `write_section`；文献阶段 + 「继续」或含糊话 → 不切阶段，应走 `ask_user`（D3）。
- 检查点续跑的 pending 不被过滤。

**上线**：`AGENT_PHASE_MODE=enforce`、`AGENT_PHASE_ENFORCE=literature`；其它阶段仍 shadow。

**验收**：上线 ≥3 天 harvest 对比：`search_storm` / `search_no_gain` 下降；`phase` 拒绝 <5% 轮次；无新增病码。

**回滚**：`AGENT_PHASE_ENFORCE=`（空）或 `AGENT_PHASE_MODE=shadow`。

---

### PHASE-09 文献阶段收尾（1d，中风险）

**做法**：
1. 小步：`local`（只给 `search_knowledge`）→ 本地已搜过一次或无命中 → `external`（加 `search_external`）→ 有命中 → `import`（加 `import_reference`）。由 `resolveAgentPhase` 按本轮 observations 算 `subStep`。
2. 按 §3 规则 3 证明后删除：`checkKnowledgeFirstGate`（被小步替代）。`checkKnowledgeRepeatGate` 改为 WALL-03 的一种墙后删除。
3. `PHASE_TASK_PACKS[1].constraints` 里已被代码保证的条目从提示里删掉，减少提示长度。

**测试**：小步推进单测；删门禁前的「不可达」单测；`eval:agent` P2 剧本绿。

**验收 / 回滚**：同 08；删门禁的 commit 单独一个，便于 revert。

---

### PHASE-10 起草阶段 enforce + 收尾（2d，高风险）

**工具集要点（D2 已拍板）**：综述（`mode=review`）允许 `search_knowledge` + `import_reference`（边写边补）；研究型**不给**检索/导入。配图工具在起草阶段给。用户在研究型起草里明确说「再找一篇文献」→ 走 D3：意图明确则临时切到 `literature`，做完按 HITL 问是否回到起草；禁止研究型起草阶段把检索工具常驻。

**小步**：`read`（常驻读工具 + `list_plot_sources`）→ 读过本节上下文 → `write`（加 `write_section` / `refine_content` / 配图）。替代 `checkReadBeforeWrite`。

**删除（规则 3 后）**：`checkDraftSearchGate`、`checkContinueWriteSpinGate`、`checkAgentToolPhaseGate` 的写节分支（无大纲/蓝图时根本不在起草阶段）。

**重点回归**：`eval:agent` P3（先读后写引言）、P4、P7；写节短路径（`ensureNextWritePrerequisite`）；大纲/蓝图检查点批准后进入起草。

**上线 / 回滚**：`AGENT_PHASE_ENFORCE=literature,draft`；回滚去掉 `draft`。

---

### PHASE-11 引用阶段 enforce + 收尾（1.5d，高风险）

**小步**：`check`（`validate_citations`）→ 有问题 → `fix`（加 `refine_content`、`read_reference`、`remove_references`）。替代 `checkCitationCheckGate`。

**删除（规则 3 后）**：`checkCiteExistingGate`、`checkCitationSideTripGate`。`checkCitationSpinGate` 改为 WALL-02 的一种墙后删除。

**重点回归**：自查 0 问题后跟聊「继续」不进 `citation_apply`（QNEXT-05 已列用例）；导出 readiness 不受影响。

---

### PHASE-12 摘要 / 审查 / 诊断阶段（1.5d，中风险）

- 摘要：只给 `write_bilingual_abstract` + 常驻。删 `checkAbstractFinishGate`、`checkAgentToolPhaseGate` 摘要分支。
- 审查：`run_review_rounds`、`check_plagiarism`、`parse_revision_comments`、`apply_revision_item`、`export_manuscript_markdown`。删 `checkReviewRequestGate`。
- 诊断：只给常驻只读工具（`inspect_project` 优先）。删 `checkDiagnoseInspectGate`。
- 此 PR 后：`AGENT_PHASE_ENFORCE` 覆盖全部阶段。

---

### PHASE-13a 完成条件影子（1d，低风险）

**目标**：在不改停止行为的前提下，比较「旧逻辑该不该停」和「新的阶段完成条件该不该停」。

**做法**：
1. `resolveAgentPhase` 增加 `isPhaseDone(observations, snapshot) → { done: boolean; reason: string }`，规则见附录 A「完成条件」列。
2. `agentNode` 在模型不调工具（准备结束）时同时算新旧两种判断；不一致 → `trace("phase_done", true, { via: "phase-shadow", reason: "old=continue new=done:…" })`。
3. harvest 加 `phase_done_mismatch` 聚合（按阶段 × 方向）。

**上线**：`AGENT_PHASE_DONE=shadow`，≥1 周。

---

### PHASE-13b 完成条件生效（2d，高风险）

**前提**：13a 数据里「新逻辑说停、旧逻辑说继续」的样本，人工看过确认新逻辑对。

**做法**：`AGENT_PHASE_DONE=on` 时：
1. `agentNode` 结束判断改为：本阶段未完成且未撞墙 → 继续（状态卡写下一步）；已完成 → 停，按 HITL 规则汇报并问下一步。
2. `routeAfterAgent` 的三条回弹（计划续跑、出图续跑、意图续跑）在 `on` 时合并为一条「阶段未完成」。
3. reflect：写节后自查并入起草阶段完成条件（写回 + 质检结论已出），`on` 时不再单独进 reflect 节点。

**重点回归**：`agent-plan-progress.test.ts`（续跑自环 512 的老坑）、`agent-reflect.test.ts`、HITL「可见结果后停」全部用例；`eval:agent` 全绿。

**回滚**：`AGENT_PHASE_DONE=shadow`。

---

### PHASE-14 意图收口为入口路由（1.5d，中风险）

**做法**：
1. `contracts/agent-phase.ts` 加 `INTENT_TO_PHASE: Record<IntentKind, AgentPhaseId | "auto">`（附录 C）。
2. `classifyIntent` 保留（跟聊继承 + 正则），输出只用于选入口阶段。
3. `rg` 每个 `isXxxGoal` / `checkXxxGate` 的引用；PHASE-09～12 后已无引用的直接删；仍被引用的列清单，逐个判断是否还需要。
4. `goal-intents.ts` 目标 ≤500 行。

**测试**：`agent-classify-intent.test.ts`、`agent-goal-intents.test.ts` 按新职责改写；`eval:agent` 全绿。

---

### PHASE-15 清理与收口（2d，中风险）

1. 全阶段 `enforce` + `AGENT_PHASE_DONE=on` + 状态卡稳定 ≥2 周后：删除 `off` 旧路径与 4 个开关（保留 `AGENT_PHASE_MODE=off` 作为最后一道紧急开关一个版本周期，再删）。
2. 拆 `toolsNode`：门禁/确认/执行/出图后处理/写节后处理拆到 `langgraph/tools-node/*.ts`，`nodes.ts` 目标 ≤700 行。
3. `phaseGatePromptRules()` 与 `PHASE_TASK_PACKS.constraints` 中已被代码保证的条目删除。
4. `docs/domain/agent.md` 按新架构重写「编排」章节，旧的日期补丁段落归档到 `docs/archive/`。

---

### WALL-R `restrict` 决策落地（1d，中风险）

**目标**：让 `decideAfterWall` 能输出「下一轮只许用某个工具」。

**做法**：
1. `wall-policy.ts`：`AgentWallDecision` 增加 `{ kind: "restrict"; tools: string[]; reason: string }` 与 `{ kind: "run"; call: ParsedToolCall; reason: string }`。
2. 状态加 `restrictToolsOnce: string[] | null`（快照持久化）。
3. `agentNode`：非空时传给 LLM 的 `tools` 只含这些（+ `ask_user`），`tool_choice: "required"`（`ai.ts` 已支持）；调用后清空。
4. `toolsNode`：`run` 决策时 `toolQueue.splice` 插入（复用现有自动排队写法）。
5. 轨迹统一 `via: "wall"`，`tool` 记墙名。
6. **D5 已拍板**，默认写进 `AGENT_WALL_LIMITS`（本 PR 把类型扩全，数值如下；调大等于关这道墙）：

| kind | 上限 | 落地 PR |
|------|------|---------|
| `figure_qa` | 3 | PHASE-00 已落地 |
| `read_spam` | 6 | WALL-02 |
| `search_storm` | 6 | WALL-03 |
| `gate_bounce` | 2 | WALL-04 |

**测试**：restrict 一轮后自动清除；与检查点续跑不冲突；`tool_choice` 透传到请求体。

**回滚**：WALL-R 本身不触发任何墙；具体墙各自可关（`AGENT_WALL_LIMITS` 调大即等于关）。

---

### WALL-02 逐篇读上限（0.5d）

- 墙（D5）：一轮内 `read_reference` + 同节分页 `read_section` 合计 ≥**6**。
- 决策：按入口意图 restrict 到动手工具（补引用 → `refine_content`；写节 → `write_section`；无明确动作 → ask 选项「基于已读的先改 / 再读 N 篇 / 换个思路」）。
- 线上依据：`cmuntp1ls` 「补引用覆盖」一轮 `read_reference` ×17。
- 吸收：`checkCitationSpinGate` 的职责（PHASE-11 后删）。

### WALL-03 检索墙（1d）

- 墙（D5）：一轮内 `search_*` ≥**6** 次且项目文献数未增加。
- 决策：最近一次检索有命中 → `run` 一次 `import_reference`（不带 hit，`resolveImportReferenceCandidates` 自动拼候选，弹勾选确认）；无命中 → ask「换关键词方向 / 用现有文献继续 / 先停」。
- 线上依据：8/18 会话 `search_storm`；`cmunqb9ft` 「补一轮文献」搜 9 次后问用户、未导入。
- 吸收：`checkKnowledgeRepeatGate`、`searchQuotaGate`（配额 20 保留为硬上限）。

### WALL-04 门禁二次回弹（1d）

- 墙（D5）：同一工具在本轮被前置门禁拒绝第 **2** 次。
- 改造：`GateVerdict` 的 reject 增加可选 `suggestTool`（门禁文案本来就写了「改用 refine_content」之类，结构化出来）。
- 决策：有 `suggestTool` → restrict；没有 → ask。
- 线上依据：`read_section` 被引用门禁拦 2 次仍继续试。

### WALL-05 空转熔断改选项卡（0.5d）

- 现状：`MAX_BREAKS_BEFORE_HARD_STOP=2` → `agent/error` + `finished`，用户看到红框。
- 改为：ask，选项来自 `resolveAgentPhase().nextAction` + 「换个说法」+「先停」。轨迹 `via=wall`、`tool=antispam`。
- 会话状态不再标 `error`（不是系统故障）。

### WALL-06 孤儿 running 回收（0.5d）

- 现状：2/18 会话 running 超 1 小时（`reclaimStaleRunningSessions` 只在进程重启时回收）。
- 改为：读会话列表 / 打开项目时，`updatedAt` 超过 15 分钟且无 `awaitingCheckpoint` / `awaitingConfirm` 的 running → 标 `interrupted`。阈值常量化。
- 测试：`session-store` 单测。

---

## 7. 观测指标

| 指标 | 来源 | 目标 |
|------|------|------|
| 病码会话占比（`search_storm`、`long_turn`、`ping_pong`、`same_call`） | harvest `--compare` | 较 2026-10-05 基线下降 ≥50% |
| `phase` 拒绝率（enforce 后模型调了集合外工具） | 轨迹 `via=phase` / 总工具数 | <3% |
| 影子误拦率（正常操作被影子标记） | PHASE-07 人工标注 | 文献阶段 <5% 才放行 |
| 撞墙触发与用户选择分布 | 轨迹 `via=wall` + 检查点回答 | 观察；某墙几乎总选「再试」→ 上限可能太低 |
| 每轮工具数中位数 | harvest | 不升 |
| 用户可见红框（`agent/error`） | Admin insights | 不升；WALL-05 后应下降 |
| `eval:agent` / 全量 vitest | CI | 始终全绿 |

---

## 8. 风险登记

| 风险 | 可能性 | 影响 | 对策 |
|------|--------|------|------|
| 阶段算错，模型缺工具干不了活 | 中 | 高 | 影子期先量；跨阶段临时切换；集合外调用走墙而不是直接失败；开关秒退 |
| 用户一句话跨两个阶段（写引言顺便补文献） | 高 | 中 | 综述起草阶段本就含检索；入口意图可临时切；`ask_user` 常驻 |
| 状态卡和历史旧提示冲突 | 中 | 中 | 系统提示声明状态卡优先；06a/06b 迁走旧提示后冲突源消失 |
| 完成条件过严/过松（停太早或停不下） | 中 | 高 | 13a 影子对比；13b 只在人工确认样本后开；回退到 shadow |
| 工具列表变化导致提示缓存失效、费用上升 | 低 | 低 | **D6 已拍板**：接受。enforce 后观察一周用量；必要时常驻工具排前，不回退到全量工具 |
| 删门禁后老问题复发 | 中 | 中 | 规则 3：不可达证明 + 1 周观察 + 单独 commit 便于 revert |
| 线上样本少（18 会话），影子期结论不可靠 | 高 | 中 | 影子期不设死日期，按轮次门槛；维护者本地按清单多走几遍补样本 |
| 并行改 `nodes.ts` 冲突 | 中 | 低 | 轨道 A、B 改 `nodes.ts` 的 PR 不同时开；WALL 系列尽量落在 `wall-policy.ts` |

---

## 9. 已拍板的决策（2026-10-04）

维护者确认：按下列建议落地。**实现与评审不得另开选项。** 要改须先改本表并记队列 §4。

| # | 问题 | 决定 | 写进哪些 PR |
|---|------|------|-------------|
| D1 | 阶段 3「蓝图确认」是否独立 | **并入**阶段 2 `outline`。HITL-STEER 后蓝图批准就是结构确认；小步仍是 `outline → blueprint`，完成条件仍是大纲和蓝图都经用户批准。`PHASE_TASK_PACKS[3]` 可暂时保留给旧简报文字，新 `AgentPhaseId` 不准再出现独立 `blueprint` 阶段。 | PHASE-02、03、08～12 |
| D2 | 综述起草能不能检索、导入 | **综述允许** `search_knowledge` + `import_reference`；**研究型不允许**把检索做成起草常驻工具。研究型用户明确说「再找文献」走 D3 临时切到 `literature`。 | PHASE-03、10 |
| D3 | 跨阶段请求自动切还是先问 | **意图明确**（`classifyIntent` 能落到单一入口阶段）→ 本轮按目标阶段给工具，状态卡写明临时切换；**不明确** → `ask_user`，禁止静默切。不加新正则。 | PHASE-08、10 |
| D4 | 影子期何时放行文献 enforce | 同时满足：文献阶段 **≥30 轮**；被影子标记的调用里「正常操作」**<5%**；**无阶段算错**。缺一条就延长影子期，PHASE-08 不开。 | PHASE-07、08 |
| D5 | 撞墙上限默认值 | **出图质检连败 3**；**一轮逐篇读 6**；**一轮连搜无新增 6**；**同一工具门禁回弹 2**。写进 `AGENT_WALL_LIMITS`；把上限调大等于关那道墙，不准悄悄改小数。 | PHASE-00、WALL-R、WALL-02～04 |
| D6 | 切阶段导致提示缓存失效、费用略涨 | **接受**。enforce 上线后观察一周 DeepSeek 用量，记 §4。用量异常只优化工具顺序或切阶段频率，不因此改回「每轮全量工具」。 | PHASE-08 |

---

## 附录 A：阶段工具集初版（PHASE-03 依据）

常驻（每阶段都给）：`inspect_project`、`read_section`、`read_project_asset`、`list_references`、`read_reference`、`recall_recent_work`、`update_work_memory`、`ask_user`、`read_attachment`、`list_attachments`、`read_figure`。

| 阶段 | 专属工具 | 小步 | 完成条件 | 现 Pack |
|------|----------|------|----------|---------|
| config | `update_paper_config` | — | 题目、类型、语言、引用格式齐 | 0 |
| literature | `search_knowledge`、`search_external`、`import_reference`、`save_reference_classification`、`read_full_text` | local → external → import | 本轮导入 ≥1 批，或文献数达目标，或用户说够了 | 1 |
| outline | `generate_outline`、`generate_writing_blueprint`、`open_blueprint_workspace` | outline → blueprint（**D1**：无独立蓝图阶段） | 大纲、蓝图均经用户批准 | 2、3 |
| draft | `write_section`、`refine_content`、`list_plot_sources`、`generate_chart`、`generate_table`、`draft_mechanism_figure`、`illustrate_mechanism_figure`、`remove_figure`、`ingest_project_data`、`generate_xrd_analysis`；**D2**：综述另加 `search_knowledge`、`import_reference`，研究型不加 | read → write | 用户点名的那一节写回且质检结论已出，停下问下一节 | 4 |
| citation | `validate_citations`、`refine_content`、`remove_references` | check → fix | `exportReady` 且无错引，或用户说先这样 | 5 |
| abstract | `write_bilingual_abstract` | — | 双语摘要写回 | 6 |
| review | `run_review_rounds`、`check_plagiarism`、`parse_revision_comments`、`apply_revision_item`、`export_manuscript_markdown` | — | 满 2 轮，或修订路线图逐条处理完，或用户说停 | 7 |
| diagnose | （只常驻） | — | 已 `inspect_project` 并给出缺口与一个下一步 | — |

> 实际工具名以 `tools/registry.ts` 为准；PHASE-03 单测会校验。

## 附录 B：门禁去向（20 道）

| 门禁 | 现在拦什么 | 去向 | 在哪个 PR 处理 |
|------|-----------|------|----------------|
| `checkAgentToolPhaseGate` | 没大纲/蓝图不许写节；没正文不许写摘要 | 自然消失 | 10、12 |
| `checkDraftSearchGate` | 写节时不许搜 | 自然消失 | 10 |
| `checkOutlineSearchGate` | 改大纲时不许搜 | 自然消失 | 12（outline 随 08～12 一并 enforce） |
| `checkCiteExistingGate` | 补引用时不许检索、导入 | 自然消失 | 11 |
| `checkCitationSideTripGate` | 改引用时不许岔去写别的 | 自然消失 | 11 |
| `checkAbstractFinishGate` | 写摘要时不许检索、导入 | 自然消失 | 12 |
| `checkReviewRequestGate` | 审查时不许写正文、检索 | 自然消失 | 12 |
| `checkDiagnoseInspectGate` | 诊断先 inspect | 自然消失 | 12 |
| `checkContinueWriteSpinGate` | 「继续」写节不许再摸底、检索 | 自然消失 | 10 |
| `checkKnowledgeFirstGate` | 先本地再外部 | 阶段内小步 | 09 |
| `checkCitationCheckGate` | 先检查再逐篇读 | 阶段内小步 | 11 |
| `checkReadBeforeWrite` | 写前先读 | 阶段内小步 | 10 |
| `checkKnowledgeRepeatGate` | 本地库换同义词连搜 | 并入撞墙 | WALL-03 → 09 删 |
| `checkCitationSpinGate` | 检查后还分页重读 | 并入撞墙 | WALL-02 → 11 删 |
| `checkClassificationRetrieveGate` | 分类时反复 list_references | 并入撞墙 | WALL-04 → 14 删 |
| `repeatGate` | 同参数重复调用 | 并入撞墙 | WALL-04（保留硬上限） |
| `searchQuotaGate` | 一轮检索 >20 | 并入撞墙 | WALL-03（20 保留为硬上限） |
| antispam 熔断 | 连续 3 次没改项目 | 并入撞墙 | WALL-05 |
| `figureReplaceGate` | 重画须就地替换 | 保留 | — |
| 确认卡 | 导入/删除要人确认 | 保留 | — |

## 附录 C：意图 → 入口阶段（PHASE-14 依据）

| IntentKind | 入口阶段 |
|-----------|----------|
| `literature`、`classify` | literature |
| `draft`、`review_write` | draft（缺大纲/蓝图时由 `resolveAgentPhase` 退回 outline，并按 HITL 先问） |
| `citation`、`citation_apply`、`pipeline_fix`、`pipeline_check` | citation |
| `abstract_finish`、`pipeline_abstract` | abstract |
| `review_request`、`pipeline_review` | review |
| `diagnose` | diagnose |
| `ap_full` | auto（按项目状态） |

## 附录 D：待迁移的催促清单（PHASE-06 依据，`nodes.ts` 行号 2026-10-04）

| 行 | 内容摘要 | 批次 |
|----|---------|------|
| ~428 | 出图续跑 `buildFigureQaContinueNudge` | 06b |
| ~438 | 计划续跑 `buildContinueNudge` | 06b |
| ~447 | 意图续跑 `pickIntentNudge` | 06b |
| ~456 | 口头宣布 `buildAnnounceToolNudge` | 06b |
| ~1262 | 机理图已排队识图质检 | 06a |
| ~1299、~1309 | 数据图 / 机理图 qaReport=block 重出 | 06a |
| ~1338 | 已生成但未进正文 | 06a |
| ~1353 | 回看未找到插入标记 | 06a |
| ~1364 | 文生图候选待人选 | 06a |
| ~1378 | 识图要重画，须 replaceImageUrl | 06a |
| ~1433 | antispam 软中断 | 06b / WALL-05 |

> 其余 `role: "user"` 为工具结果（`formatToolObservationForLlm`）、门禁拒绝回执、检查点回执，不属于催促，保留。
