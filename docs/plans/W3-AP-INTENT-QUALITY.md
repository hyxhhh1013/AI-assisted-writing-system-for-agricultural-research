# W3-AP-INTENT-QUALITY：意图状态化 + 规则 SSOT + 质量可度量

> **状态**：规划生效（2026-08-15）  
> **队列**：[`ENGINEERING_OPTIMIZATION_QUEUE.md`](../ENGINEERING_OPTIMIZATION_QUEUE.md) §1 Phase 11d  
> **域文档**：[`domain/agent.md`](../domain/agent.md)  
> **前置诊断**：控制面靠 prompt + 正则 + 门禁三层堆叠；`IntentKind` 已存在但只用来挑 nudge；质量尺仍是启发式，claim grounding 默认关。  
> **与 3.8 关系**：Wave 3.8（DATA-01～04 + HUB-01～03）**已收口**。3.9 不改 workbench 导航 / 配图坞 / plot 页。

---

## 0. 北极星

跟聊不再把 `goal` 字符串当唯一意图源。每轮只分类一次，写入会话快照；规则只写一处；收口路径默认能量一量「写得好不好」。

```text
用户跟聊「A / 继续 / 好」
        │
        ▼
snapshot.intentKind（继承，除非明确换任务）
        │
        ├─ gate / skipPlanner / nudge     只看 kind
        ├─ system prompt                  由 AGENT_RULES 按 kind 渲染
        └─ validate_citations 收口        默认 claim grounding（失败降级）
```

**门禁三类（本波必须分清）：**

| 类型 | 例子 | 本波 |
|------|------|------|
| 口语意图门 | `isSectionDraftGoal` 正则、「写章节禁止 search」 | **冻结**：不准再加 `isXxxGoal` / `checkXxxGate` |
| 领域不变量 | 空数据拒写 results、引用越界、精确小数须 ⊆ claims | 3.8 已做；3.9 **不扩** |
| 事故型安全门 | refine 缩水保护、antispam 停滞熔断 | 只在出事之后加 |

---

## 1. 问题（为何是架构债而不是再加一条正则）

今天的数据流：

```text
goal 字符串
  ├─ isDiagnoseStyleGoal()
  ├─ isLiteratureHuntGoal()
  ├─ isSectionDraftGoal(goal)          ← 跟聊「A」为 false
  ├─ isSectionDraftGoal(goal, obs)     ← 靠 write_section 观察回推
  ├─ isCitationCheckGoal()
  └─ …共 11 个独立谓词，可重叠
        │
        ├─ prompts.ts 再写一遍纪律
        ├─ phase-gates.ts 再拦一遍
        └─ nudge / stopAsk 再渲染一遍
```

`IntentKind` 与 `INTENT_CLOSURES` 已经在 `goal-intents.ts` 里，但：

- 只用于 `pickIntentNudge` / `pickIntentStopAsk`
- **没有**进 `AgentSessionSnapshot`
- 跟聊覆盖 `goal` 后，全部门禁重新对残缺字符串跑正则  
  （2026-08-08 `W3-AP-WRITE-DISCIPLINE`：goal 失真用 observations 补，是补丁不是根治）

质量面：

- `lib/quality-eval/` 四维确定性打分，可进 CI，但量不出「句意张冠李戴」
- ~~`citation-claim-grounding` 要 `CITATION_CLAIM_GROUNDING=1` 才跑~~ **QUALITY-CLAIM done**：收口默认开，`=0` 才关
- ~~LLM-judge 未进 `eval:quality`~~ **QUALITY-JUDGE done**：规则分始终打印；LLM 分无 key 则跳过

LangGraph：`graph.ts` 42 行线性拓扑；暂停/续跑靠 `pendingToolCalls` 短路。本波 **冻拓扑**，不重写 interrupt/checkpoint。

---

## 2. 目标架构

```text
contracts/agent-intent.ts     IntentKind（从 goal-intents 上提，快照可引用）
        │
classifyIntent(goal, observations, previousKind)
        │  inherit | regex | (日后 shadow LLM)
        ▼
AgentSessionSnapshot.intentKind
        │
        ├─ checkDraftSearchGate(kind, tool)
        ├─ shouldSkipPlanner(kind)
        ├─ mergeFollowUpGoalHint(kind)
        ├─ pickIntentNudge(ctx)          ctx.kind 来自快照，不再重判 goal
        └─ renderAgentRules(kind)        prompt / nudge 同一事实源
```

**权威源（必须只有一份）：**

| 对象 | 存哪 | 谁写 | 谁读 |
|------|------|------|------|
| 本轮意图 | `AgentSessionSnapshot.intentKind` | `classifyIntent`（每轮一次） | 全部 gate / nudge / skipPlanner |
| 纪律条文 | `AGENT_RULES[]` | 人改这一处 | `buildAgentSystemPrompt`、nudge 渲染、hard gate 只认 `severity: hard` |
| 引用句意判定 | `claimGrounding`（validate 结果） | verifier 角色 LLM | Agent 改引；eval 对照 |
| CI 质量地板 | `lib/quality-eval` 确定性四维 | 纯函数 | `npm run eval:quality`；**不**进热路径每轮写后 |
| 回归对照尺 | `quality-eval/llm-judge.ts` | verifier LLM | 仅 `eval:quality`；无 key skip；禁止 write_section |

---

## 3. PR 序列（先状态化，再规则表，再尺子）

依赖只能向下。**第一刀不上 LLM 分类。**

| 序 | ID | 内容 | 估时 | 依赖 | 与 3.8 |
|----|-----|------|------|------|--------|
| 0 | **冻结** | 禁止新 `isXxxGoal` / 口语 `checkXxxGate` | — | 即刻 | 3.8 已收口 |
| 1 | **W3-AP-INTENT-01** | `IntentKind` 上提契约；快照字段；每轮只分类一次；跟聊继承；不一致打日志 | 1.5d | — | **done** 2026-08-15 |
| 2 | **W3-AP-INTENT-02** | gate / skipPlanner / hint **只消费** `state.intentKind` | 1d | 01 | **done** 2026-08-15 |
| 3 | **W3-AP-RULES-01** | `AGENT_RULES` 单一事实源；prompt/nudge 渲染；hard 才进 gate | 1d | 02 | **done** 2026-08-15 |
| 4 | **W3-AP-QUALITY-CLAIM** | 收口路径默认开 claim grounding；`=0` 才关 | 0.5d | — | **done** 2026-08-15 |
| 5 | **W3-AP-QUALITY-JUDGE** | LLM-judge 只进 `eval:quality`，不进热路径 | 1d | CLAIM 或并行 | **done** 2026-08-15 |
| 6 | **W3-AP-INTENT-SHADOW** | 可选：LLM 分类影子模式，与正则对照记日志 | 0.5d | 01 | **有数据再决定是否 promote** |

推荐开干顺序：**INTENT-SHADOW**（INTENT-01/02、RULES-01、QUALITY-CLAIM、QUALITY-JUDGE 已于 2026-08-15 落地）。  
SHADOW 不是入场券：01 的跟聊继承若已修好「A/继续」，LLM 增量可能很小，允许结论为「不 promote」。

---

## 4. 各 PR 任务单

### W3-AP-INTENT-01 — 意图进快照

**目标：** 跟聊「A」不再导致写章节纪律丢失；分类每轮一次。

**禁止：** 不上 LLM 分类；不重写 LangGraph；不加新口语门禁；不改 `backup_*`；不用 `any`；不往 `workbench/page.tsx` 堆逻辑。

**先做：** `rg` `isSectionDraftGoal` / `IntentKind` / `mergeFollowUpGoalHint` / `AgentSessionSnapshot`。

**实现顺序：**

1. 新建 `src/contracts/agent-intent.ts`  
   - 从 `goal-intents.ts` 上提 `IntentKind`  
   - 补齐现有门禁用到、但枚举里没有的：`diagnose` / `classify` / `ap_full`（或等价名）  
   - `goal-intents.ts` re-export，避免一次改完所有 import
2. `AgentSessionSnapshot` 增加可选 `intentKind?: IntentKind | null`（旧快照缺省 = 本轮重判）
3. `classifyIntent(input)` 纯函数：  
   - `previousKind` 存在且本轮 goal 像跟聊（短回复 / 「继续」/「好」/「A」）→ `inherit`  
   - 用户明确换任务（检索、审查、写另一节、分类编码）→ 重判  
   - 返回 `{ kind, source: "inherit" | "regex" }`
4. `run-graph` / `session-continue`：跟聊把上一快照的 `intentKind` 传入；persist 写回
5. 日志：`regex(goal)` 与 `regex(goal, observations)` 或与 `inherited` 不一致时 `logger` 一条（不要新表）

**验证：** `npx vitest run src/__tests__/lib/agent-goal-intents.test.ts` + 新增 inherit 用例（goal=`A` + previous=`draft` → 仍为 `draft`）。  
**数据流：** follow-up → snapshot.intentKind → classifyIntent → 新快照。

---

### W3-AP-INTENT-02 — 消费者只认 kind

> **状态**：✅ done 2026-08-15

**目标：** `nodes.ts` / 门禁 / hint **禁止**再对 `goal` 跑一遍意图正则。

**实现顺序：**

1. `checkDraftSearchGate` / `checkDiagnoseInspectGate` / `checkCitationSideTripGate` / `shouldSkipPlanner` / `shouldPauseForConfigConfirm` 的 goal 维改为吃 `IntentKind`（可暂时保留 goal 重载做测试迁移，合并前删重载）
2. `mergeFollowUpGoalHint` / `mergeGoalWithIntentHint` 改为 `nudgeForKind(kind, ctx)`
3. `pickIntentNudge` 的 `ctx` 带已分类 `kind`，不要内部再 `isSectionDraftGoal(ctx.goal)`
4. `agent-goal-intents.test.ts` 加「只传 kind、goal 为垃圾字符串仍拦 search」用例

**验收：** `isSectionDraftGoal` 仅留在 `classifyIntent` 内部（或删除，逻辑并入分类器）。  
**数据流：** toolsNode → gate(kind) → ok/error observation。

---

### W3-AP-RULES-01 — 规则单一事实源

> **状态**：✅ done 2026-08-15

**目标：** 「勿 `build_argument_blueprint`」等纪律只改一处。

**实现顺序：**

1. `src/lib/agent/core/agent-rules.ts`：`AGENT_RULES: { id, text, appliesTo: IntentKind[] | "*", severity: "nudge" | "hard" }[]`  
   第一批不超过 20 条，先收已在打架的：  
   - 勿 `build_argument_blueprint`  
   - 综述必须 `subsectionTitle` 逐子节  
   - 写章节缺文献照常写（检索 1 次确认没有即可开写）  
   - 引用修正必须 `refine_content` 写回  
   - 研究型 results 必须有数据根基（文案；硬拦仍走 `data-foundation`）
2. `buildAgentSystemPrompt`：按当前 `intentKind` 渲染对应 `text`，删掉 prompt 里的重复段落
3. nudge 函数改为读同一 id；`phase-gates.ts` 只保留结构性 hard（缺大纲不能蓝图等），条文不手写第二份
4. 单测：改一条 `text`，prompt 片段与 nudge 同时变化（快照或 includes）

**禁止：** 把 `goal-intents.ts` 998 行搬进规则表；规则表不是分类器。

---

### W3-AP-QUALITY-CLAIM — 收口默认 claim grounding

> **状态**：✅ done 2026-08-15

**目标：** 最值钱的一层不再 opt-in 关掉。

**实现顺序：**

1. `validate-citations.ts`：文献有摘要时 **默认跑**；`CITATION_CLAIM_GROUNDING=0` 才跳过  
   （失败仍 `claimGrounding: null`，不阻断）
2. 可再收窄：仅当本次是引用核查 / AP 流程收口 / 用户显式 `validate_citations` 时跑，避免每轮 reflect 自查都烧 verifier  
   ——若 reflect 例行 validate 会误伤成本，**必须**收窄，并在 `agent.md` 写清触发条件
3. `.env.example` 注明默认开、关法、以及「无摘要则 skip」
4. 单测：不设 env 时，有摘要 fake judge 仍被调用

**数据流：** `validate_citations` → `evaluateCitationClaimGrounding` → summary `【claim 接地】`。

---

### W3-AP-QUALITY-JUDGE — eval 用 LLM-judge ✅ done 2026-08-15

**目标：** 有第二把尺对照确定性 `quality-eval`，回答「改完变没变好」。

**禁止：** 在 `write_section` / `toolsNode` 热路径每轮调用。

**已落地：**

1. `lib/quality-eval/llm-judge.ts`：verifier 角色，固定 rubric → JSON（引用支撑 / 数据-结论 / overclaim / 连贯），可注入 fake judge
2. `scripts/eval-quality.ts`（`npm run eval:quality`）同时打出规则分 + LLM 分；`--no-llm` 只打规则分
3. 夹具：现有 `GOOD_PAPER` / `BAD_PAPER`；无 key / 失败 → skipped，退出码 0
4. 域文档：规则尺 = CI 地板；模型尺 = 回归对照（不可比绝对值）

---

### W3-AP-INTENT-SHADOW — LLM 分类影子（可选）

**目标：** 用数据决定要不要替换正则分类器，而不是先重写。

**实现顺序：**

1. `classifyIntent` 在 `source: "regex"` 时异步再跑一次便宜模型，输出必须是 `IntentKind`
2. 不一致只记日志，**不**写快照
3. 收集 10～20 条真实跟聊后再决定 promote；若 inherit 已覆盖「A/继续」，允许 **cancelled（数据不足 / 无增量）**

---

## 5. 验收剧本（产品 + 回归）

1. **跟聊继承**：写引言过程中用户回「A」→ 仍禁止无故 `search_knowledge`，仍提示 `write_section`。  
2. **明确换任务**：写节过程中用户说「检索 10 篇」→ kind 变为 `literature`，允许 search。  
3. **规则一处改**：改 `AGENT_RULES` 里「勿 build_argument」条文，system prompt 与 nudge 同时变，gate 不出现第三份文案。  
4. **claim 默认**：不设 `CITATION_CLAIM_GROUNDING=1`，有摘要的 `validate_citations` 仍出现 `claimGrounding` 或显式降级 null（无 key）。  
5. **eval:quality**：无 key 时确定性四维仍绿；有 key 时多一列 LLM 分。

---

## 6. 明确不做（本波）

- 不上多 agent / planner-worker 分叉  
- 不把 LangGraph 换成原生 `interrupt()`，也不退化成手写 `while`（冻拓扑）  
- 不删确定性 `quality-eval` 换成纯 LLM  
- 不把 LLM-judge 接到每轮写后  
- 不扩 `goal-intents.ts` 正则  
- 不改 Prisma raw SQL / Turbopack workaround  
- 不动 `context.budget` 双账本 / `projectDirty`（意图进快照之后若再咬人再开 PR）  
- 不回头改 3.8 已收口的导航 / 配图坞 / `/plot`（除非回归失败）

---

## 7. 文档与队列

| 改动 | 更新 |
|------|------|
| 本计划 | 本文 |
| 队列登记 | `ENGINEERING_OPTIMIZATION_QUEUE.md` §1 Phase 11d + §4 + §5 |
| 战略 | `MASTER_PLAN.md` Wave 3.9 |
| 域入口 | `DOMAIN_INDEX.md` Agent 行；`domain/agent.md` 一节 |

完成某一 PR 时：代码与上述文档**同一 commit**；任务单勾选本文件对应节。  
`src/` 有净改动而 docs 无改动 → commit message 必须写 `docs: 无需更新（理由）`。
