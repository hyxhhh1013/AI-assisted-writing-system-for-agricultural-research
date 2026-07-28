# W3-AP-BEHAVIOR：Agent 行为可靠（智能化主轴）

> **状态**：规划生效（2026-07-25）  
> **定位**：能力桥（LIT/CONFIG/CHART/MULTI-TURN）已够用 → **暂停横向扩工具**，主攻「会干活、少空转、可回归」。  
> **挂载**：队列 `W3-AP-BEHAVIOR` / `W3-AP-EVAL-SCRIPTS` / `W3-AP-ANTISPAM` / `W3-AP-READ-BEFORE-WRITE`  
> **不做**：全自动八阶段 Conductor；平行写作引擎；与剧本无关的新 Tab/新站点。

---

## 0. 产品定义（本波次）

Agent = **会诊断、会取证、会落地、会停下来问你的写作搭档**。

每周只问三句：

1. 哪条剧本通过率提升了？  
2. 空转 / 选错工具少了多少？  
3. 有没有为「假智能」加了用不起来的功能？

---

## 1. 执行序（建议 4～6 周）

| 序 | ID | 内容 | 预估 |
|----|-----|------|------|
| S0 | **W3-AP-EVAL-SCRIPTS** | 固化 5 条剧本 + 断言；可本地跑（mock LLM 或录制轨迹） | ✅ done |
| S1 | **W3-AP-ANTISPAM** | 压空转：重复 read/search、无进展循环 | ✅ done |
| S2 | **W3-AP-READ-BEFORE-WRITE** | 先读后写硬门禁（缺大纲/文献上下文则拒写并说明） | ✅ done |
| S3 | W3-AP-LIT-QUALITY | 文献相关度说明 + 禁止无依据导入 | ✅ done |
| S4 | W3-AP-WORK-MEMORY | 会话工作记忆：主张 / 已否决策 / 待办 | ✅ done |
| S4b | W3-AP-CONFIG-QA | Phase0 配置一问一答 | ✅ done |

新工具 / Wave 4 抛光：**仅当某条剧本稳定失败且断言指向缺口时**再开。

---

## 2. 第一周：五条剧本与断言（S0）

> 实现落点建议：`src/lib/eval/agent-scripts.ts` + `src/__tests__/eval/agent-scripts.eval.test.ts`  
> 命令：并入 `npm run eval:gates` 或新增 `npm run eval:agent`。

### 共同夹具（Fixture）

| 字段 | 要求 |
|------|------|
| project | 有 title；可缺大纲 / 缺文献（按剧本） |
| 工具观测 | 记录 `toolName[]` 顺序、是否 `agent/confirm`、是否写回 |
| 预算 | 单剧本 `toolCallCount ≤ 12`（改道剧本 ≤ 16） |

### 剧本 P1 — 诊断卡点

| | |
|--|--|
| **用户 goal** | `看看项目现在卡在哪，建议下一步` |
| **前置** | 无大纲或引言为空（二选一即可） |
| **必须调用** | `inspect_project`（允许前后夹杂 read_*） |
| **禁止** | 首轮就 `write_section` / `generate_outline`（未征得同意） |
| **断言** | 最终回复含「缺口」语义（大纲/文献/章节等至少一类）+ ≥1 个可执行下一步 |
| **空转** | 同一 `read_section` 窗口连续 ≤ 2 次 |

### 剧本 P2 — 文献导入闭环

| | |
|--|--|
| **用户 goal** | `检索并导入 1 篇与「生物炭改良土壤」相关的文献` |
| **前置** | `AGENT_WRITE_ENABLED=1`；项目可写 |
| **必须调用** | `search_external` →（参数含 hitJson 的）`import_reference` |
| **必须事件** | 出现 `agent/confirm`（或会话 `awaitingConfirm`） |
| **模拟用户** | 批准确认后续跑 |
| **断言** | 最终 `import_reference` 成功且 `persisted: true`；`referenceCount` 增加 |
| **禁止** | 编造 hitJson（必须来自 search 返回） |

### 剧本 P3 — 先读后写引言

| | |
|--|--|
| **用户 goal** | `写引言` |
| **前置** | 已有 outline；≥1 条参考文献（或允许先 list/search） |
| **必须顺序（软）** | 写之前至少一次：`read_project_asset(outline)` 或 `inspect_project` 或 `list_references` / `read_section` |
| **必须调用** | `write_section` 且 `section=introduction`（或等价） |
| **断言** | 写回 persisted；回复含字数或「已写回」说明 |
| **禁止** | 零上下文直接 write（S2 门禁落地后改为硬失败） |

### 剧本 P4 — 中途改道

| | |
|--|--|
| **用户 turns** | ① `写结果节` → ②（下一轮）`先别写了，改大纲` |
| **断言 turn1** | 可开始读/写 results，但 turn2 后不得继续 `write_section(results)` |
| **断言 turn2** | 出现 `generate_outline` 或明确询问大纲修改要点；或进入 outline 检查点 |
| **禁止** | 无视改口、按原 plan 把结果节写完 |

### 剧本 P5 — 审稿意见落地

| | |
|--|--|
| **用户 goal** | 粘贴 2～3 条外审意见 + `按意见改讨论部分` |
| **必须调用** | `parse_revision_comments` → ≥1 次 `apply_revision_item`（major 优先） |
| **断言** | 路线图非空；至少一条写回 discussion（或说明跳过 positive 的理由） |
| **禁止** | 只解析不改、或整章无依据重写 |

---

## 3. S1 空转治理（验收口径）

在现有 `checkRepeatCall` 之上补充：

1. **无进展熔断**：连续 3 次工具未改变 project 指纹（大纲 hash / ref count / section chars）→ 强制中文总结并问用户  
2. **检索配额**：同 goal 内 `search_external` + `search_knowledge` 合计 ≤ 20（综述需多轮换 query；除非用户明确要求继续搜）
3. **文献体量**：综述 / 备文献默认目标 **≥30 篇**（可分批 import，单次最多 15）；「一篇」才只导 1 篇
4. **检索效率**：`search_external` 变体并行；默认 fast 模式先 OpenAlex+S2，不够再补 CrossRef/PubMed；单次 limit 建议 20～25，少换 query、多批量导入
3. **读窗口**：`read_section` 同 section 同 offset 连续 ≤ 2（已有 soft 提示则改为可测断言）

---

## 4. S2 先读后写硬门禁（验收口径）

对 `write_section` / `refine_content`（introduction / discussion 优先）：

- 本会话（或近 N 条 toolSummaries）未见相关 `inspect` / `read_project_asset` / `list_references` / `read_section` → **拒写**，返回可执行补读建议  
- 与 phase-gates 并列，可单测，不依赖 LLM 自觉

---

## 5. 与现有文档关系

| 文档 | 关系 |
|------|------|
| `W3-AP-agent-academic-paper-orchestration.md` | 能力桥 done；行为主轴见本文 |
| `MASTER_PLAN.md` Wave 3.5 | 主轴改为 BEHAVIOR |
| `ENGINEERING_OPTIMIZATION_QUEUE.md` §1 | 任务卡状态源 |

---

## 6. 完成定义（本波次 Done）

- [x] `eval:agent`（或 gates 子集）覆盖 P1～P5，CI/本地可跑  
- [x] ANTISPAM + READ-BEFORE-WRITE 硬约束落地  
- [x] P1～P3 手测 + 自动断言双绿（2026-07-26：脚本 `handtest-agent-behavior.ts`；同日复测全绿）  
- [x] 空转指标：复测均值约 **4.2** tool/goal（P0=0，P1=3，P2=4，P3=11；含蓝图自补）  
- [x] 诊断强制 inspect + 写节禁无谓检索 + 意图弱续跑（`goal-intents` / `MAX_INTENT_CONTINUES`）  
- [x] 写节短路径：`ensureWritePrerequisites` 自动补大纲/蓝图（`autoPrereq`）；写节 goal 全程禁 `search_*`；手测 `handtest-write-shortpath` ≤8 工具
- [x] 未新增与剧本无关的 Agent 工具（本波次只加门禁/评测）

---

## 7. 手测收口清单（P0 + P1～P3，约 15～20 分钟）

> 环境：`AGENT_ENABLED=1`；P2/P3 写回需 `AGENT_WRITE_ENABLED=1`（及前端公开写开关若有）。  
> 自动侧：`npm run eval:agent`（2026-07-26 通过）。

### 前置：配置问答（P0）

| # | 步骤 | 期望 |
|---|------|------|
| 0.1 | 打开**配置不完整**的项目 → Agent Tab | 顶部出现「填写论文信息」；或自动弹出一问一答 |
| 0.2 | 发任意 goal（如「看看卡在哪」）且配置仍不完整 | 出现 `config_confirm` 检查点 + 问答 UI（不依赖 `project` 已加载） |
| 0.3 | 答完题目/类型/语言/引用/篇幅 → 确认 | 写回 passport；检查点通过；可继续对话 |
| 0.4 | 点「稍后再说」 | 面板收起；再点「填写论文信息」可重开 |

### P1 — 诊断卡点

| | |
|--|--|
| **项目** | 无大纲，或引言为空 |
| **goal** | `看看项目现在卡在哪，建议下一步` |
| **期望** | 先 `inspect_project`（可夹杂 read）；**首轮不**直接 `write_section`/`generate_outline`；回复含缺口语义 + ≥1 个可执行下一步 |
| **记一笔** | 本轮工具次数 ≈ ___ |

### P2 — 文献导入闭环

| | |
|--|--|
| **goal** | `检索并导入 1 篇与「生物炭改良土壤」相关的文献` |
| **期望** | `search_external` → 确认卡 → 批准后 `import_reference` 成功；参考文献数 +1；工作台刷新 |
| **禁止** | 无 search 结果却硬导入；低相关无 why 仍导入 |
| **记一笔** | 本轮工具次数 ≈ ___ |

### P3 — 先读后写引言

| | |
|--|--|
| **前置** | 已有 outline；≥1 条参考文献 |
| **goal** | `写引言` |
| **期望** | 写前至少一次 inspect/read/list；`write_section(introduction)` 写回；回复含字数或「已写回」 |
| **禁止** | 零上下文直接写成功（应被门禁拒绝并提示补读） |
| **记一笔** | 本轮工具次数 ≈ ___ |

### 手测通过后

1. 勾选本文 §6「P1～P3 手测」与「空转指标」（填入三轮 tool 次数均值即可）  
2. 队列 `W3-AP-BEHAVIOR` → `done`；MASTER_PLAN Wave 3.6 同步

### 代码入口（S0）

| 文件 | 用途 |
|------|------|
| `src/contracts/agent-eval-script.ts` | 轨迹 / 断言结果类型 |
| `src/lib/eval/agent-scripts.ts` | 断言器 + golden/anti fixtures |
| `src/__tests__/eval/agent-scripts.eval.test.ts` | 套件 |
| `npm run eval:agent` | 只跑行为剧本 |
