# W3-AP-QUALITY：Agent 写作质量主轴（对齐 academic-paper Phase 4→7）

> **状态**：规划生效（2026-07-28）  
> **定位**：行为主轴（W3-AP-BEHAVIOR）已收口 → 下一主轴攻 **写出质量与收口能力**，把 Agent 从「能写段落」推到「接近 skill Phase 4 完成稿 + 可用 Phase 5–7」。  
> **挂载**：队列 Phase 11 `W3-AP-QUALITY*`；实时 status 只看 [`ENGINEERING_OPTIMIZATION_QUEUE.md`](../ENGINEERING_OPTIMIZATION_QUEUE.md) §1。  
> **对照 skill**：Claude `academic-paper` 八阶段 / 十模式；**不**复刻全自动 Conductor、**不**新建平行流水线站点。

---

## 0. 基线（2026-07-28 实测）

样本：项目「生物炭改良土壤综述」。

| 项 | 现状 |
|----|------|
| Passport | Phase 4 起草中 |
| 结构资产 | 大纲 / writingBlueprint / argumentBlueprint 齐 |
| 文献 | 39 篇；编号 OOB=0 |
| 正文 | background / literature_body 有体量；introduction 偏薄；无双语摘要 |
| 引用语义 | 曾严重错引（人工 remap）；外部 soft-grounded 利用不足 |
| 配图 | 工具通；CSV 曾 latin-1 乱码（已修编码，待入队验证）；支持 `chartIndices` 批量 |
| 入口 | 新建向导三档 `full` / `outline_ready` / `data_ready`（代码已有，已登记 done 2026-08-06） |
| vs skill | 工具约 Phase 0–4；质量约 **Phase 4 未完成**；5–7 有壳未形成闭环 |

每周只问三句：

1. 错引 / 空引用是否下降？  
2. 分节完整度 + 摘要是否能自动推到可检？  
3. 有没有为对齐 skill 而加「用不起来的大而全」？

---

## 1. 明确不做（本波次）

| 项 | 原因 |
|----|------|
| 全自动八阶段 Conductor | 已 cancelled；对话定位 |
| `plan` 苏格拉底分章引导 | 成本高；入口三档已够 |
| Generator–Evaluator 4a/4b/6a/6b 纸盲合同 | skill 重协议；先用 WQC 轻量质检 |
| `academic-paper-reviewer` 五人组外审 | 继续用 `run_review_rounds` 内审 |
| Stage 2.5 / 4.5 100% integrity agent | 用 cite-ground + gate 渐进 |
| LaTeX / Pandoc / disclosure | 归 Wave 4 / 后续；本波只保证 MD 导出可用 |
| deep-research 完整护照 handoff | 另波；本波只强化项目内文献接地 |

---

## 2. 执行序（建议 3～5 周）

| 序 | ID | 内容 | 估时 | 依赖 |
|----|-----|------|------|------|
| S0 | **W3-AP-QUALITY** | 本计划 + 队列挂载 + MASTER_PLAN Wave 3.7 | 0.5d | BEHAVIOR done |
| S0b | **W3-AP-ENTRY-WIZARD** | 入口三档+配置进新建向导（已实现则收口文档/测） | 0.5d | — | **done** 2026-08-06：核对全链路已落地，补独立单测 + 队列登记 |
| S0c | **W3-AP-CHART-CJK** | CSV UTF-8 优先解码 + `chartIndices` 批量；回归中文刻度 | 0.5d | CHART-BRIDGE | **done** 2026-08-06：解码冒烟通过 + `parseChartIndices` 单测 8 例（含边界修复） |
| S1 | **W3-AP-CITE-GROUND** | 引用语义接地：写后 DOI/题名/摘要对齐检查 + 错引告警/自动 remap 建议 | 2～3d | CITE-GATE, LIT-QUALITY |
| S2 | **W3-AP-DRAFT-COVER** | 分节完整度：最短字数门禁、inspect 报告缺口、Agent 提示「补薄节」 | 1～2d | READ-BEFORE-WRITE |
| S3 | **W3-AP-WQC** | 写作质检轻量版：AI 腔 / overclaim / 段长单调；写后 observation 或 `verify_content` 增强 | 1～2d | DRAFT-COVER |
| S4 | **W3-AP-ABS-FLOW** | 正文够长 → 推 `write_bilingual_abstract`；Passport Phase 5b 信号 | 1d | ABSTRACT, DRAFT-COVER |
| S5 | **W3-AP-REVIEW-FLOW** | 摘要后可选 `run_review_rounds`；外审粘贴 → parse → apply 剧本加固 | 1～2d | REVIEW-2, REVISION |
| S6 | **W3-AP-LIVE-EVAL** | 可选 live/录制轨迹：错引率、节完整、摘要存在；并入 `eval:agent` 扩展 | 1～2d | CITE-GROUND, DRAFT-COVER |

**产品优先级**：S1 引用接地 > S2 分节完整 > S3 文风质检 > S4/S5 收口 > S6 可回归。

---

## 3. 分项验收口径

### S1 CITE-GROUND

> **状态：done（2026-07-28）** — `lib/citation-grounding.ts`；`validate_citations` / `inspect_project` 已接线。

- 写后（或 `validate_citations` 扩展）能报告：**编号合法但语义可疑**的 `[n]`（题名/摘要关键词与句意 Jaccard 或 embedding 低分）  
- Agent 提示禁止「把 Prompt 文献示例表写进章节」（已有 strip；保持回归测）  
- soft-grounded 外部文献：写作 prompt / 蓝图鼓励使用；inspect 显示「未引用外部池」比例  
- 单测：已知错引样本能检出；无 OOB 回归

### S2 DRAFT-COVER

> **状态：done（2026-07-28）** — `lib/draft-coverage.ts`；inspect / 简报 / Agent 快捷语已接线。

- `inspect_project` 增加：各节 chars、相对目标字数、薄节列表  
- 综述默认期望节：`introduction` / `background|literature_body` / `conclusion`（+ abstract）  
- 研究型：`methods` / `results` / `discussion`  
- Agent 在「写完引言就停」时，若用户 goal 是整篇，应主动建议下一薄节

### S3 WQC

- 规则清单（中文）：喉清开场、综上所述堆砌、overclaim、段长方差过低  
- 输出 warn 级，**默认不阻断写回**；严重 overclaim 可标到 review  
- 不对齐 skill 全文 Writing Quality Check 文档移植，只取可测子集

### S4 ABS-FLOW

- 正文合计 ≥ N 字且无有效摘要 → inspect / 简报提示「可写双语摘要」  
- Agent goal「收口/定稿」默认调用 `write_bilingual_abstract`

### S5 REVIEW-FLOW

- 剧本 P5 保持绿；补「摘要后审查」提示词  
- 不引入五人组

### S6 LIVE-EVAL

- 默认仍 mock 轨迹；`EVAL_LIVE=1` 时可选跑 1 条冒烟（需 Key）  
- 指标：tool 序 + 写回后 cite OOB=0 + 目标节 chars 下限

---

## 4. 与 skill 模式映射（本波次目标态）

| academic-paper 模式 | 本波次目标 |
|---------------------|------------|
| `full` | 对话可走完 0→4 且引用/分节质量可检；5–7 可选手动触发 |
| `outline_ready` / `data_ready` | 入口向导稳定 |
| `abstract-only` | ABS-FLOW 常用路径 |
| `citation-check` | CITE-GROUND 增强（不止编号） |
| `revision` / `revision-coach` | REVIEW-FLOW 加固 |
| `plan` / `format-convert` / `disclosure` | **不做** |
| Generator–Evaluator | **不做**；用 WQC 代替轻量质检 |

---

## 5. 代码入口（改前 rg）

| 区域 | 路径 |
|------|------|
| 引用硬检 | `src/lib/citation-gate.ts`、`agent/tools/validate-citations.ts`、`lib/reference-reorder.ts` |
| 写作 prompt | `src/lib/prompts/writing.ts`、`agent/core/prompts.ts` |
| 写节 | `agent/tools/write-section.ts`、`pipeline/finalize.ts` |
| inspect | `agent/tools/inspect-project.ts`、`project-briefing.ts` |
| 质检 | `agent/tools/verify-content.ts`、`review-content.ts` |
| 摘要 | `agent/tools/write-bilingual-abstract.ts` |
| 图表编码 | `scripts/charts/plot_utils.py`、`font_setup.py`、`generate-chart.ts` |
| 入口 | `entry-mode.ts`、`create-project-wizard.tsx`、`paper-passport.ts` |
| eval | `lib/eval/agent-scripts.ts`、`npm run eval:agent` |

---

## 6. 完成检查（主轴收口时）

- [ ] §2 表中 S1～S5 对应队列行均为 `done`（S6 可 done 或明确 backlog）  
- [ ] 样本综述或新夹具：引言不再「单段过薄」；无章节末参考文献表；OOB=0  
- [ ] 至少 1 次双语摘要经 Agent 路径写回  
- [ ] 中文类别名柱状图刻度无乱码（重生成验证）  
- [ ] `npm run eval:agent` + 相关 vitest 绿  
- [ ] MASTER_PLAN Wave 3.7 → 收口；下一主轴再议 Wave 4 / plan-mode

---

## 7. 会话日志指针

合并时同步：

1. [`ENGINEERING_OPTIMIZATION_QUEUE.md`](../ENGINEERING_OPTIMIZATION_QUEUE.md) §1 Phase 11 + §4 + §5  
2. [`MASTER_PLAN.md`](../MASTER_PLAN.md) Wave 表  
3. 本文不维护 status（只维护口径）；status 以队列为准
