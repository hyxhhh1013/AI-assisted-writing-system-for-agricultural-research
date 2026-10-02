# W3-AP-QUALITY-NEXT — 写节质量缺口 + 控制面克制

> 2026-09-30。对齐队列 **Phase 18**。前置：WRITE-QA-001～010（Phase 14）、HITL-STEER（Phase 17）、INTENT-QUALITY（冻结口语门禁）。  
> **状态**：QNEXT-01～04 **已落地**；05–07 仍 blocked。  
> **不换** LangGraph，**不重开** INTENT-SHADOW，**不解冻** `POST /api/writing`。

## 问题

质量地板（越界引用、结果编数字、空话、HITL 一轮一结果）已齐。模型变强后，再加门禁/工具/三跳 LLM 对稿件帮助很小。剩下的是：**主张没写上、软接地张冠李戴、质检埋在工具卡里、ingest 失败把人逼去编数据**。控制面只在有评测证明误拦时才动。

## 北极星

每一单必须回答「稿子哪条变好」或「用户少卡哪一步」。答不出就不开 PR。

## 本波行为

| ID | 板块 | 提升 | 行为 |
|----|------|------|------|
| QNEXT-01 | 4 下一刀可见 | 便捷→质量 | ✅ 本轮 `qaReport` 的 repair/block 进续跑条；收口「文风」点按跳节 |
| QNEXT-02 | 1 主张覆盖 L4 | 质量 | ✅ `blueprint_claim_uncovered` 为 repair（不 block、不触发定向 refine） |
| QNEXT-03 | 2 证据钉死 | 质量 | ✅ soft 句内精确数据未在摘要 → `cite_semantic_mismatch`（011 起不 persist）；unbound 硬挂 [n] 为 repair 并剥引用 |
| QNEXT-04 | 3 结果数字合同 | 质量+便捷 | ✅ ingest 失败可恢复文案；inspect/简报列出 dataClaims；不放宽无数据写 results |
| QNEXT-05 | 5 控制面审计 | 便捷 | 每个拟删门禁先有 `eval:agent`/vitest 失败用例；禁止再加 `isXxxGoal` |
| QNEXT-06 | 6 技能包 | 延后 | **blocked**：须先出现稳定「选错合法工具」评测模式 |
| QNEXT-07 | 7 内环三跳 | 延后 | **blocked**：须 `eval:quality` golden A/B（full vs 关 Refiner）L0–L4 不回退 |

## 开工顺序

```text
QNEXT-01 → QNEXT-02 → QNEXT-03
QNEXT-04 可与 01 并行
QNEXT-05 / 06 / 07 保持 blocked，直到表内「须先有」满足
```

Phase 16（SEC / workbench 瘦身）是**另一条轨**，不挡本波，也不算写作质量。

## 关键文件

| 单 | 文件 |
|----|------|
| 01 | `continue-hint.ts`、`quality-closure.ts`、`quality-closure-panel.tsx`、`use-agent.ts` |
| 02 | `writing-qa-run.ts`、`contracts/writing-qa.ts`、`write-qa-fixtures.ts` |
| 03 | `evidence-binder.ts`、`citation-grounding`、write_section observation |
| 04 | `ingest-project-data` / 附件提取提示、`project-briefing.ts`、`inspect-project` |
| 05 | `tool-gates.ts`、`goal-intents.ts`（只删有测的误拦）、`src/lib/eval/agent-scripts.ts` |
| 06 | `tools/registry.ts`（暂不动） |
| 07 | `writing-runner.ts` / 写节 fast·full；Admin 角色开关（暂不动） |

## 验收闸门

- 改 01–04：`npm run eval:quality`（分节 golden）必须绿。
- 改 05：现有 `eval:agent` 全绿；新增「自查 0 问题后跟聊继续 → 不进 citation_apply」。
- 06/07：未满足 blocked 条件不得改热路径。

## 语料闭环（不靠人一篇篇点）

线上写节用 `scripts/harvest-write-qa-corpus.py` 扫最近 `AgentSession` 的 `qaReport`：code × 是否 persist。

Agent 当场发现靠 `writingAudit`（`inspect_project` / 写节 observation）。自进化仍是：harvest 或扫描出现新洞 → golden → 规则。禁止运行时改 prompt 当进化。

每一类只走一次：harvest 出现新洞 → 最短坏样进 `write-qa-fixtures.ts`（事实类加 `expectPersist: false`）→ `eval:quality` 红直到规则落地。确定性规则进 WRITE-QA；写错章 / 检索过宽进编排门。改 Writer 前先跑 harvest + golden。

## 明确不做

重写图拓扑、多智能体、热路径 LLM-judge、per-card RAG、让模型估算实验数值、自动连写下一节把 warn 写没、运行时扫 `tools/` 磁盘。
