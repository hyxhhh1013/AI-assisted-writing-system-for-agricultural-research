# WRITE-QA — 写作生成质量系统

> **状态**：规划生效（2026-08-22）  
> **定位**：把写节从「超长 prompt + Writer 一锅生成 + 事后 LLM 审查」升级为「规格编译 + 证据绑定 + 确定性质检 + 结构化回修」。  
> **挂载**：队列 **Phase 14 `WRITE-QA-*`**；实时 status 只看 [`ENGINEERING_OPTIMIZATION_QUEUE.md`](../ENGINEERING_OPTIMIZATION_QUEUE.md) §1。  
> **对照**：FIG-QA（图表质量系统）同构；academic-paper 的 claim–evidence 与 Writing Quality Check（只取可测子集）。**不**复刻十二代理 Conductor，**不**解冻旧扩写管道。

---

## 0. 为什么现在还是工程问题

Wave 3.7（W3-AP-QUALITY）已经把 **完整度面** 铺开：引用语义接地、分节字数、4 条 WQC、摘要/审查收口、`eval:quality`。这些都是「能写完一节、引用不炸」。

质量面仍然碎：

| 层 | 现状 | 失败模式 |
|----|------|----------|
| 规格 | 蓝图已有 `claim / keyPoints / warrant / assignedSources`，只拼成「【写作蓝图（本节）】」散文 | 模型可忽略；没有「本节必须覆盖哪些主张」的合同 |
| 证据 | RAG 一次倒一堆 `[n]`，Writer 自己挑 | 编号合法但张冠李戴；soft-grounded 被写成精确数据 |
| 生成 | `lib/prompts/writing.ts` 堆数百行「禁止」 | 约束越长越容易被忽略；改规则只能继续加 prompt |
| 质检 | WQC 4 条短语，且**只挂在** `verify_content` | 写节热路径不跑；喉清 / 空话 / Results 混 Discussion 写回后才可能被看见 |
| 回修 | Verifier 再写一篇意见，Refiner 再掷一次骰子 | 为了「过审」会删引用、删 overclaim，而不是改准 |
| 看板 | 质量收口看节完整 / 摘要 / 引用硬检 / 是否审查 | 一段写得很像 AI 腔、主张没落地，看板仍可全绿 |
| 回归 | `eval:quality` 四维规则尺 + 离线 LLM-judge | 改 prompt 不知道引言/结果会不会一起变差 |

产品口头禅「Agent 能写、人再改」把正文质量推给了人。完整度期合理，现在引用/分节地板已齐，再靠人工改腔会把质量债锁死。

旧扩写管道已冻结（W3-AP-ARCH-03），但 `write_section` 仍复用它。新规则若继续改 `run-pipeline.ts`，和冻结纪律打架；若不改，质量提升没有落点。

**根因一句话**：写作被当成「调 Writer 模板」，没有被当成「编译器」。

---

## 1. 目标态

Agent 或写节工具提交的是 **本节语义合同**，不是一锅 context 字符串。系统编译成可校验的 `SectionSpec`，先绑证据再写，写完跑确定性质检；失败则按 finding 补丁，而不是整节重写。

```text
意图（用户 / 蓝图子节 / write_section）
    → SectionSpec IR（类型化、版本化）
    → Spec Compiler（蓝图主张 + 分配文献 + dataClaims + 章节语域）
    → Evidence Binder（每条 claim → grounded [n] 或 [D#]）
    → Writer（按 claim card 扩写，不再对着 400 行禁令自由发挥）
    → Deterministic QA（L0–L3）
    → 可选 LLM Verifier（只打规则看不见的灰区）
    → Spec Patch Loop（finding → 改正文或改 spec，最多 N 轮）
    → Persist + qaReport（observation 带 code 级缺陷）
```

验收口径（主轴收口时必须同时成立）：

1. 研究型 Results：正文精确数字 ⊆ `dataClaims`；无 Discussion 推测句式；observation 带 `qaReport`。  
2. 综述子节：每条蓝图 `claim` 至少有 1 个 grounded/soft-grounded 编号；禁止无出处「普遍结论」。  
3. 引言：有缺口句、无「从未有人研究 / 填补空白」；字数落在预算带内。  
4. 摘要：无文内 `[n]`；不出现正文没有的数据。  
5. 写节 observation 不再只有「已生成 N 字」，必须带 `qaReport.findings[].code`。  
6. 引言 / 方法 / 结果 / 讨论 / 综述子节各有 1 条 golden fixture；改 Writer 或质检必须跑对应夹具。

---

## 2. 明确不做

| 项 | 原因 |
|----|------|
| 解冻 `POST /api/writing` 加功能 | W3-AP-ARCH-03 已定；新质量层做在 Agent 包装器 |
| 复刻 academic-paper 十二代理 / Generator–Evaluator 合同 | 贵、重协议；用 claim card + 规则尺代替 |
| 再往 `writing.ts` 堆「禁止」 | 那是旧路径，会继续分叉 |
| 热路径 LLM-judge 打分 | 对齐 FIG-QA / Wave 3.9：规则尺进热路径，模型尺只进 `eval:quality` |
| 把 WQC 做成「降 AI 检测」 | 目标是更清楚的学术散文，不是 humanizer |
| 写节失败就整节重掷 | 必须 finding → 补丁；最多 1 次定向 refine |
| 推倒 Wave 3.7 | 引用接地 / 分节完整 / 摘要收口是本波地板，不是重做对象 |

---

## 3. 质量合同（什么叫「过」）

对照 FIG-QA 的 L0–L5，裁成写作可自动判定的六层。**L0–L3 必须确定性**；L4 覆盖蓝图主张；L5 才允许 LLM。

| 层 | 名称 | 过线条件 | 实现位置 |
|----|------|----------|----------|
| **L0** | 证据完整 | 每张 claim card 有证据 ID；Results 精确小数 ⊆ claims；无越界 `[n]` | Spec Compiler + 现有 `citation-gate` / `reconcileResultsNumbers` |
| **L1** | 章节语域 | Results 不用「可能反映/提示/或许由于」；摘要无 `[n]`；无 `###` 标题；无文末文献表 | 章节规则表（新建，不进 prompt） |
| **L2** | 文风几何 | 喉清开场、空话、em dash、段长 CV、连续句长过齐 | 升级 `writing-quality.ts`，**挂到写节热路径** |
| **L3** | 引用语义 | 编号在池内 + 题名/摘要词重叠；soft-grounded 句不得含该文献没有的精确数字 | 现有 `citation-grounding` 写后就跑（不只收口） |
| **L4** | 论证覆盖 | 蓝图 `claim` / `keyPoints` 在正文中可对齐；未覆盖则 warn/repair | Spec vs 正文对齐 |
| **L5** | 残余灰区 | 句意张冠李戴、跨节逻辑 | 现有 Verifier；**默认不整节 refine** |

判定三态与图表对齐，**code 必须机器可读**：

```text
block  → 不能写回章节（L0 编造数字、越界引用修不掉、Results 无数据根基）
repair → 自动补丁再检（剥空话、归一引用、定向 refine 一条 finding）
pass   → 可写回；warn 只提示（如段长偏齐）
```

旧的「自动核查通过 / 已按 N 条意见修正」只作为对用户的中文标签，底层以 `qaReport.findings[].code` 为准。

---

## 4. SectionSpec IR（单一事实源）

新契约：`src/contracts/section-spec.ts`。蓝图 `SectionGuide` 是原料，不是运行时合同。

```ts
interface SectionSpecV1 {
  version: 1;
  sectionKey: string;
  subsectionTitle?: string;
  register:
    | "introduction" | "methods" | "results"
    | "discussion" | "review_body" | "conclusion" | "abstract";
  claimCards: Array<{
    id: string;                 // C1, C2…
    claim: string;
    evidence: Array<
      | { kind: "ref"; n: number; grounded: "full" | "soft" }
      | { kind: "data"; id: string }
    >;
    warrant?: string;
  }>;
  constraints: {
    minChars: number;
    maxChars: number;
    forbidDiscussionInResults?: boolean;
    forbidInlineCite?: boolean;
  };
  assignedSourceIds: string[];
  figureSlots: string[];
}
```

规则：

- Agent **禁止**再把松散 `context` 当主路径；只许传 `SectionSpec` 或「sectionKey + subsectionTitle」，由 Compiler 补全。  
- 现有 `write_section.context / bullets` 由适配器升格，不立刻删。  
- 仓库里已经有两块可复用，不要重造：蓝图 `SectionGuide`，以及冻结管道的 `expand_bullet`。Compiler 的输出优先变成 **claim cards → bullets**，而不是再写一条平行流水线。

`WritingQaReport` 镜像 FIG-QA 的 `ChartQaReport`：`findings[].code` + `verdict: block | repair | pass`。放 `src/contracts/writing-qa.ts`。

---

## 5. 证据绑定（质量的技术核心）

对应 FIG-QA 的 Layout Solver：质量不来自「模型更听话」，而来自**写之前把主张和证据钉死**。

新建 Agent 侧（**不要改** `run-pipeline.ts`）：

- `src/lib/agent/section-compiler.ts`
- `src/lib/agent/evidence-binder.ts`

最小编译循环（**禁止**按 card 再跑全库 RAG；绑定必须确定性、零额外索引加载）：

1. 从蓝图取出本节 `claim / keyPoints / assignedSources`（002 Compiler）。  
2. **Evidence Binder 只打项目里已有的题录/摘要/`dataClaims`**（`termOverlapRatio`），每卡 1–3 条。不 `getFullText`，不 N 次 `retrieve`。  
3. 每张 card 绑定 1–3 个编号：full（有 PDF `sourceName`）可写该文献数据；soft（仅摘要）只许概括。  
4. 绑不上的 card：证据槽空；项目有文献池时 `qaReport` 记 `evidence_unbound`（warn，006 再谈 block）。  
5. Writer 看见短表「C1 → `[2]soft [5]full`」+ **绑中文献的摘要**；`selectedSourceIds` 收到绑中有文件的论文（收窄 RAG）。蓝图 keyPoints **不再**复制进 `WritingInput.bullets`（hint 里已有，避免双份）。

这直接打到现在最伤质量的点：模型对着 20 篇文献自由点号。若 004 做成「N × 全库检索再拼接」，Writer token 会炸。

---

## 6. 确定性质检

把 `checkWritingQuality` 从「`verify_content` 附属」升级为写节门。扩展中文可测子集，**不**移植 academic-paper 全文英文词表。

| code | 层 | 默认动作 |
|------|----|----------|
| `number_not_in_claims` | L0 | block（Results；图/表号与 p 值不对账。拦截也算写节收口，禁止整节重试） |
| `cite_oob` | L0 | repair：现有 strip |
| `cite_semantic_mismatch` | L3 | repair：建议 remap；不确定则剥该 `[n]` |
| `results_discussion_bleed` | L1 | repair：推测句改报告句或移出 |
| `abstract_has_cite` | L1 | repair：现有 `stripInlineCitations` |
| `embedded_bib` / `md_heading` | L1 | repair：已有/补确定性剥离 |
| `throat_clear` / `hollow_phrase` | L2 | repair：短语表替换或删句首套话 |
| `overclaim` | L2 | repair：换成 hedge；≥3 处升 severe |
| `para_monotone` / `sentence_monotone` | L2 | warn |
| `blueprint_claim_uncovered` | L4 | repair：补一段或标缺口 |
| `evidence_unbound` | L0 | warn 或从 spec 剔除该 card |

`write_section` 的 observation 升格为：

```text
draft + charCount + pipelineMode + qaReport
```

质量收口看板加第 5 个信号：**最近一节 / 全文 prose QA**，避免「四灯全绿、正文仍空」。

---

## 7. Agent 回修环

替换「Verifier 写长评 → Refiner 整节重写」：

```text
compile(spec) → bind(evidence) → write(cards)
  → qaReport
  → 若有 repairable：applyWritingPatches(draft|spec, findings)
       （先确定性，再最多 1 次定向 refine）
  → 仍有 block：不 persist，observation 带 findings
  → pass：写回 + qaReport
```

`applyWritingPatches` 是纯函数表（TS），例如：

- `cite_oob` → `stripOutOfRangeCitations`  
- `abstract_has_cite` → `stripInlineCitations`  
- `throat_clear` → 删句首套话  
- `results_discussion_bleed` → 动词表替换（可能反映 → 观察到）  
- 剩下的灰区才调用现有 `runAgentRefineContent`，feedback **只含 code + 原文片段**，禁止再喂一篇散文审查

现有 `reflect.ts`「写完必须 validate / verify」可收成：热路径已跑 L0–L3 则不再口头催 `verify_content`。

---

## 8. PR 总表

| ID | 标题 | 依赖 | 估时 | 状态 |
|----|------|------|------|------|
| **WRITE-QA-000** | 本计划 + 队列挂载 + 域文档指针 | — | 0.5d | **done** |
| **WRITE-QA-001** | `SectionSpecV1` + `WritingQaReport` 契约；旧 context/bullets 适配器 | 000 | 1d | **done** |
| **WRITE-QA-002** | Spec Compiler：蓝图 + 语域约束 + 字数带 | 001 | 1.5d | **done** |
| **WRITE-QA-003** | WQC 升级并挂到 `write_section` 热路径（先确定性、默认不阻断 persist） | 001 | 1d | **done** |
| **WRITE-QA-004** | Evidence Binder：项目文献池词重叠绑定（不做 per-card RAG） | 002 | 2d | **done** |
| **WRITE-QA-005** | `applyWritingPatches`（确定性优先，≤1 次定向 refine） | 003, 004 | 1.5d | **done** |
| **WRITE-QA-006** | persist 看 `block`；observation 带 `qaReport`；收口看板第 5 信号 | 005 | 1d | **done** |
| **WRITE-QA-007** | 压缩 Writer prompt：禁令迁到 QA code，模型只看 spec + 证据卡 | 002, 005 | 1d | **done** |
| **WRITE-QA-008** | Golden：引言/方法/结果/讨论/综述子节 + `eval:quality` 夹具 | 003 | 1.5d | **done** |
| **WRITE-QA-009** | `write_section` 主路径改吃 Spec；context 只作适配 | 002, 006 | 1d | **done** |
| **WRITE-QA-010** | 剖面收口：先 `results` + `literature_body` 子节 + `introduction` | 008, 009 | 1.5d | **done** |

建议执行序：`000 → 001 → 003 ∥ 002 → 004 → 005 → 006 → 007 → 008 → 009 → 010`。

**先做 001+003+004**：没有 IR 和证据绑定，后面的看板和 prompt 瘦身都是空转。

与 FIG-QA 文件面几乎不重叠，可另开会话并行；不要在同一 PR 里混改进图和写节。

---

## 9. 代码入口（改前 rg）

| 区域 | 路径 |
|------|------|
| 写节 | `src/lib/agent/tools/write-section.ts`、`writing-runner.ts` |
| 蓝图 | `src/contracts/writing-blueprint.ts`、`lib/agent/blueprint-write-context.ts` |
| 质检 | `src/lib/agent/writing-quality.ts`、`lib/quality-eval/checks.ts` |
| 引用 | `src/lib/citation-gate.ts`、`citation-grounding.ts`、`precise-data-grounding.ts` |
| 数据 | `src/lib/agent/results-number-reconcile.ts`、`data-foundation.ts` |
| 回修 | `src/lib/agent/writing-runner.ts` `runAgentRefineContent` |
| 看板 | `src/lib/agent/quality-closure.ts`、`components/shared/agent/quality-closure-panel.tsx` |
| 管道 | `src/app/api/writing/*`（**只修 bug**；新规则禁止进这里） |
| 评测 | `src/lib/quality-eval/`、`npm run eval:quality` |

影响范围关键词：`checkWritingQuality`、`verify_content`、`write_section`、`prepareAgentWriteBlueprintContext`、`AGENT_WRITE_AUTO_FIX`、`quality-closure`。

---

## 10. 验证

每个 PR：

```text
npx tsc --noEmit
npx vitest run src/__tests__/contracts/section-spec src/__tests__/contracts/writing-qa src/__tests__/lib/writing-quality
```

WRITE-QA-008 起：`npm run eval:quality` 必须覆盖新 golden；规则分始终打印。LLM-judge 无 key 则 skip，**禁止**从 `write_section` 调用。

---

## 11. 文档同步

| 改动 | 文档 |
|------|------|
| 本计划 | 本文 |
| 队列状态 | `ENGINEERING_OPTIMIZATION_QUEUE.md` §1 Phase 14 + §4 + §5 |
| 域摘要 | `domain/agent.md` 增加「写作质量系统」一节 |
| 入口 | `DOMAIN_INDEX.md` AI 写作表加 WRITE-QA 行 |
| 战略 | `MASTER_PLAN.md` 增 Wave 3.12 一行（不挡 FIG-QA / Wave 4） |
| 冻结管道 | `domain/writing-pipeline.md` 只加指针，不加新功能 |

---

## 12. 完成检查（主轴收口）

- [x] §8 表 001～010 均为 `done`  
- [x] Agent 写 Results：L0–L3 无 block；observation 含 findings  
- [x] 综述子节按 card 绑定，不再一次倒整库  
- [x] Writer prompt 明显短于本波之前；禁令在 QA code 表  
- [x] 旧扩写管道无新功能行  
- [x] 文档与代码同一批提交  

---

## 13. 与 Wave 3.7 / 3.9 的关系

| 已有 | 本波用法 |
|------|----------|
| CITE-GROUND / DRAFT-COVER / ABS-FLOW | L0 / 字数带 / 摘要规则的地板 |
| WQC 4 规则 | L2 种子；扩成 code 表并挪到写节门 |
| QUALITY-JUDGE | 继续只活在 `eval:quality` |
| ARCH-03 冻结旧管道 | 全部做在 Agent 包装器 |

3.7 不推倒。它解决「能不能写完、引用会不会炸」。本波解决「写出来像不像能投稿的学术正文」。

---

## 14. 会话日志指针

合并时同步：

1. 队列 §1 Phase 14 + §4 + §5  
2. `domain/agent.md`  
3. 本文只维护口径；status 以队列为准
