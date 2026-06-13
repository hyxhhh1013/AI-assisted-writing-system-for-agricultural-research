# 写作管道（L3 业务）

> 源码真相：`src/app/api/writing/`、`src/lib/prompts/writing.ts`、`src/contracts/sse.ts`。

## 模式

| `mode` | 行为 |
|--------|------|
| `full`（默认） | Writer → Verifier → Refiner → 引用/数据校验 |
| `fast` | 仅 Writer |
| `expand_bullet` | 单条要点 Writer（096c）；SSE `bullet_done` |
| `audit_only` | 仅 Verifier 报告流 |
| `fix_only` | 按 `verificationFeedback` Refiner 流式修正 |

## UI 流程（ENG-PR-081）

扩写面板 `WritingFlowMode`：

| 流程 | API `mode` | 行为 |
|------|------------|------|
| **标准（人控，默认）** | 初稿 `fast` → `audit_only` → `fix_only` | Writer 后停；用户点「提交审查」「按意见修正」 |
| 快速预览 | `fast` | 仅 Writer |
| 完整模式（实验） | `full` | 自动全管道（需二次确认） |

## 规划：协作扩写（ENG-PR-096）

目标流程：**选文献（096a）→ 定要点 `bullets[]`（096b）→ 逐条 `expand_bullet`（096c）→ 段落/选区微调（096d）**。

| 阶段 | 状态 | 说明 |
|------|------|------|
| 096a 检索预览 | done | 扩写前 API 返回 RAG 命中，用户勾选后进引用池 |
| 096b 要点列表 | done | `WritingRequest.bullets[]` + UI 要点列表 |
| 096c 逐条扩写 | done | 标准人控流程默认 `mode: expand_bullet`；采纳后合并 |
| 096d 段落微调 | done | 工作台默认段落模式；`paragraph-editor` 选区助手（扩写/润色/审查/精简） |

任务单：[`docs/plans/ENG-PR-080-human-in-the-loop.md`](../plans/ENG-PR-080-human-in-the-loop.md) §五B。

## 阶段与文件

```text
prepare-context.ts     RAG + 证据包 + system prompt
pipeline/writer.ts     DeepSeek 流式初稿
pipeline/verifier.ts   Zhipu/DeepSeek 核查（可 fallback）
pipeline/refiner.ts    引用归一化 + 非流式修正
pipeline/finalize.ts   validateCitations / validateDataClaims
run-pipeline.ts        编排
route.ts               SSE 外壳
```

## SSE 事件（节选）

客户端用 `src/contracts/sse.ts` 类型守卫解析，**禁止**随意改 `type` 字符串。

| type | 含义 |
|------|------|
| `status` | retrieving / writing / verifying / refining / completed |
| `pipeline_step` | 步骤进度条 |
| `delta` | Writer/Refiner 正文增量 |
| `verification` | Verifier 报告增量 |
| `corrected_text` | 替换全文（引用修正后） |
| `clear_result` | Refiner 前清空 UI |
| `references` | 新引用文献列表 + refMapping |
| `citation_warnings` | 引用风险 |
| `data_claim_warnings` | 数据证据异常 |
| `error` | 失败 |
| `bullet_done` | 单条要点扩写完成（096c）：`bulletIndex`、`content`、`bulletCount` |

## 业务不变量（热规则摘要）

- 引用编号必须在 RAG 返回的 `[1]…[N]` 范围内；越界会被 strip + 警告。
- **正文引用格式**：仅半角方括号 `[1]`、`[2,3]`、`[1-3]`。禁止 `【16】`、`［16］`、`[文献16]` 等变体（Prompt 与后处理均约束）。
- **引用归一化**：`src/lib/citation-bounds.ts` 的 `normalizeAllCitationFormats`（含角括号 `【n】` → `[n]`）在 Refiner、预览、应用到章节时执行；测试见 `src/__tests__/lib/citation-bounds.test.ts`。
- 综述模式章节 Prompt：`src/lib/prompts/review-writing.ts`；综述引用规则：`review-synthesis-rules.ts`。
- Verifier 检查 overclaim、Results/Discussion 混淆，不只查引用真假。
- Prompt 已注入 nature-polishing 原则（见 `prompts.ts` 注释）。
- 农业场景：GB/T 7713 与 SCI 双轨、`domain.ts` 术语适配。

## 前端

- `writing-panel.tsx` + `useWritingStream`（或等价 hook）
- 大文件拆分目标：ENG-PR-031

## 改动的连带更新

- 新 SSE 类型 → `contracts/sse.ts` + 前端守卫 + 本节
- 新 prompt 规则 → `lib/prompts/writing.ts` + 本节摘要
- 管道阶段变更 → `run-pipeline.ts` + [`DOMAIN_INDEX.md`](../DOMAIN_INDEX.md)
