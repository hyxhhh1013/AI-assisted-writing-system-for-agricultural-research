# 质量预检方案：组内查重 + AI 可疑条带

> 2026-09-30。**不是**知网终检。业务仍只进 `plagiarism-service.ts`；页面 `/plagiarism`。
>
> 前置：`docs/domain/review-plagiarism.md`、现网七层笛卡尔比对基本不可用。

## 1. 产品合同

对用户只承诺两件事：

| 指标 | 含义 | 禁止说成 |
|------|------|----------|
| **库内重合预检** | 相对实验室知识库 + 本项目文献 + 同账号其他稿，标出可点开的重合段 | 知网总文字复制比 |
| **AI 可疑占比** | 段级高/中/低条带的加权估计，低置信 | 知网 AIGC / 格子达 AI 率 |

页脚固定一句：提交学位/期刊前仍须送正式查重与 AIGC。

默认检测范围：

- **开**：知识库检索比对、项目参考文献 chunk、文内近重复、跨项目（同用户）。
- **关**：联网学术（可选；走 `searchExternalLiterature`）。
- **AI 条带**：默认开；失败展示「未完成」，禁止当 0 分通过。

## 2. 架构（两套管线，一个报告）

```
正文分段（句/段，保留 offset）
        │
        ├─► 重合管线  retrieve → align → 报告
        │     1) localRAG 按段检索 top-k（全库，禁止 take 300 笛卡尔）
        │     2) 项目 references / 已导入 PDF 同源优先加权
        │     3) 可选联网摘要
        │     4) 字面对齐：k-gram 或 Winnowing 指纹 overlap + 字符区间
        │
        └─► AI 管线（独立分数，不写入 maxSimilarity）
              规则特征（套话、指称密度、句长方差、与草稿近重复）
              可选：第三方 API（以后）
```

**禁止**：用 DeepSeek「打一个抄袭分」冒充 AI 率；套话 finding 与文献命中抢同一 `sourceText` 去重键。

借鉴开源的是 **Winnowing / MinHash 对齐思想**（如 Noplag engine 的 retrieve-then-align），不引入整站依赖、不接盗版知网库。

## 3. 数据（最小增量）

`PlagiarismCheck` 增加（JSON 即可，避免大迁移）：

- `overlapCoverage`：命中字符 / 检测字符（库内重合预检主数字）
- `aiSuspectRatio`：高+中条带字符占比
- `aiStatus`：`ok | failed | skipped`
- `layerStats`：各层命中数、是否超时

`PlagiarismMatch.matchType` 收口：

- `kb` 知识库、`ref` 项目文献、`self` 文内、`cross` 跨项目、`web` 联网
- `ai_band` 仅 AI 条带（不参与 overlapCoverage）

对齐必须带：`sourceOffset` + `sourceLength`，预览才能滚到原文。

## 4. 分波交付

### 波次 A — 口径与诚实（约 3 天）

- 总览双数字：库内重合 / AI 可疑；去掉「一个百分比=一切」。
- `detectAiAssessment`：失败写 `aiStatus=failed`；模型走现网 `callAI` 配置，勿写死后吞错。
- 去重键改为 `(offset, matchType)`，评语不再挤掉文献命中。
- 检测范围文案改成上表。

验收：LLM 超时页面不是绿灯 0%；纯自写短文默认不高风险。

### 波次 B — 查重预检可用（约 8–12 天，主翻盘）

- 删掉「300 chunk × 全段 n-gram」。每段：`localRAG.search`（或现有 RRF）top-k，再算相似。
- 取消「全文只抽 60 段」；按章批跑，SSE 已有 `progress`。
- 跨项目：对节做 chunk 再检索，不要段对整节 800 字。
- Embedding 命中单独列，**禁止再 ×0.5 压分**。
- 联网默认关；打开则调用 `literature-search`，失败可见。
- 参考文献列表、纯图题、超短公式行跳过或降权。

金标（必须写进测试，可 fixture 缩小）：从知识库抽一段贴进稿 → 必须打出该 PDF 文件名 + 可预览片段。过不了不准标波次 B 完成。

### 波次 C — AI 条带（约 5–8 天，B 稳定后）

- 段级特征打分 → 高/中/低；全文 `aiSuspectRatio`。
- 农业综述套话白名单，避免「综上所述」刷高。
- 中英分阈值。
- **不接** Fast-DetectGPT/Binoculars 上生产，除非本机 GPU 与中文农学集评过；默认规则条带。
- 第三方 AIGC API 仅配置开关，单独一列，失败不影响 B。

验收：同一节「手写材料方法」vs「Agent 扩写综述」条带可分开；不要求对齐知网绝对值。

### 波次 D — 降重闭环

只改已定位重合段；采纳后只重跑这些 offset。不把审查四维塞进查重总分。

## 5. 代码落点

| 改 | 路径 |
|----|------|
| 唯一业务 | `src/services/plagiarism-service.ts` |
| 检索 | `src/lib/rag.ts`（search，勿新笛卡尔） |
| 联网 | `src/lib/literature-search.ts` |
| 对齐工具 | 新建 `src/lib/text-fingerprint.ts`（k-gram / winnowing，单测） |
| 契约 / UI | `contracts/plagiarism.ts`、`quality-overview.tsx`、`detection-scope.tsx` |
| Agent | `check_plagiarism` 只调同一 service |
| 文档 | 本文件 + `docs/domain/review-plagiarism.md` |

路由 `POST /api/plagiarism/v2` 保持薄壳。

## 6. 明确不做

- 宣传或 UI 暗示代替知网 / Turnitin / 知网 AIGC。
- 用更大 LLM 给全文打终检分。
- 为「像知网」去爬知网或买非官方接口。
- 把 Noplag / ScholarGuard 整仓嵌进来当主站（可抄算法，不换产品壳）。

## 7. 建议开工顺序

**A → B 金标通过 → C。** C 抢在 B 前仍是一个不准的百分数。
