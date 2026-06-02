# 写作管道（L3 业务）

> 源码真相：`src/app/api/writing/`、`src/lib/prompts/writing.ts`、`src/contracts/sse.ts`。

## 模式

| `mode` | 行为 |
|--------|------|
| `full`（默认） | Writer → Verifier → Refiner → 引用/数据校验 |
| `fast` | 仅 Writer |
| `audit_only` | 仅 Verifier 报告流 |
| `fix_only` | 按 `verificationFeedback` Refiner 流式修正 |

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

## 业务不变量（热规则摘要）

- 引用编号必须在 RAG 返回的 `[1]…[N]` 范围内；越界会被 strip + 警告。
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
