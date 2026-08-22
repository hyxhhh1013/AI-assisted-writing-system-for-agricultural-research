# 审查与查重（L3 业务）

> 源码：`src/services/review-service.ts`、`src/services/plagiarism-service.ts`、`src/contracts/review.ts`（及查重相关 contracts）。

## 论文审查（Review）

### 入口

| 层 | 路径 |
|----|------|
| 页面 | `src/app/review/page.tsx`（重定向至质量中心审查 Tab） |
| 组件 | `src/components/shared/review/`（`review-workspace`、`review-history-list`） |
| API | `POST /api/review` |
| 多轮编排 | `POST|GET /api/review/rounds`（max 2；`lib/review-rounds.ts`；Agent `run_review_rounds`） |
| 历史 | `GET /api/review/history`、`GET /api/review/[id]` |
| Service | `src/services/review.ts`（前端）、`review-service.ts`（后端逻辑） |
| Admin | `GET /api/admin/reviews`、`GET /api/admin/reviews/[id]` |

### 行为

- **四维度并行**：学术规范、论证逻辑、结构、诚信（`review-academic` 等 prompt 文件）。
- **默认模型**：`review-service` 调用智谱（`provider: "zhipu"`）；概要生成同款。
- 请求经 **`validateBody(reviewSchema)`**；返回 JSON 结构化 `ReviewReport`（非 SSE）。
- 结果持久化 **`ReviewCheck`**（`prisma/schema.prisma`），含 `overallScore` / `overallGrade`。
- **W3-REVIEW-2**：最多 2 轮；第 2 轮注入上一轮中高严重度问题；同步 Passport `reviewRound`（`doneCount>=2` → Phase 7 done）。

### 不变量

- 审查输入为项目章节快照（`sections` + `outline`），不直接改工作台正文；应用修复走其他流程。
- 改维度或评分规则 → `lib/review-scoring.ts` + prompt 文件 + 本节。

---

## 引用硬检（W3-CITE-GATE）

| 层 | 路径 |
|----|------|
| 契约 | `contracts/citation-gate.ts` |
| 算法 | `lib/citation-gate.ts`（基于 `markOutOfBoundsCitations`） |
| API | `GET|POST /api/citations/gate` |
| 客户端 | `services/citations.ts` |
| 导出 | `POST /api/export/pdf` 未过稿返回 422 `CITATION_GATE_BLOCKED`；`POST /api/export/readiness` 含 bib_only 软告警（不阻断） |
| Passport | Phase 5 `done` 仅当 `citationGatePassed`；快照 `paperPassport.citationGate` |

验收：越界编号无法标「可过稿」/导出 PDF。

---

## 查重（Plagiarism）

### 入口

| 层 | 路径 |
|----|------|
| 页面 | `src/app/plagiarism/page.tsx` → `QualityWorkspace` |
| 审查（兼容） | `/review` 重定向至 `/plagiarism?tab=review` |
| API（主） | `POST /api/plagiarism/v2` — 统一 service 薄壳 |
| 兼容 | `POST /api/plagiarism/check` |
| 改写 | `POST /api/plagiarism/rewrite`、`PATCH` 接受/拒绝建议 |
| 历史 | `GET /api/plagiarism/history` |
| Service | `plagiarism-service.ts`（**唯一业务实现**） |
| 前端 hook | `use-plagiarism-check` → `services/plagiarism.ts`（SSE 调 **v2**） |
| Admin | `GET /api/admin/plagiarism`、`GET /api/admin/plagiarism/[id]` |

### 检测层（`PlagiarismConfig`）

| 开关 | 说明 |
|------|------|
| `selfDuplication` | 文内段落滑动窗口 |
| `crossProject` | 与同用户其他 `Project` 比对 |
| `knowledgeBase` | 与 `KnowledgeChunk` / RAG 比对 |
| `embeddingSemantic` | 向量余弦相似度 |
| `webSearch` | Semantic Scholar + OpenAlex（默认关，需用户勾选） |
| `academicCliche` | 学术套话正则 |
| `aiAssessment` | DeepSeek 结构化评估 |

### 响应形式

- **JSON**：默认 `POST /api/plagiarism/v2` 返回完整结果。
- **SSE**：`Accept: text/event-stream` 时推送 `progress` / `done` / `error`（非 `WritingSSEEvent` 形状）。

### 数据模型

- `PlagiarismCheck` → `PlagiarismMatch` → `RewriteSuggestion`
- `matchType`：`local` | `web` | `cross`

### 不变量

- 新查重逻辑只改 **`plagiarism-service.ts`**，勿在 v1/v2 route 里复制业务。
- `webSearch=true` 时注意超时（`maxDuration = 180`）。
- 改阈值或层 → `DEFAULT_CONFIG` + 本节 + [`API_INDEX.md`](../API_INDEX.md)。

---

## 与写作管道的区别

| | 写作 `/api/writing` | 审查 | 查重 v2 |
|--|---------------------|------|---------|
| 流式 | Writer/Verifier SSE | JSON | 可选 SSE 进度 |
| 目的 | 生成/修正正文 | 质量评分报告 | 相似度与改写建议 |
| Prompt | `lib/prompts/writing.ts` | `review-*.ts` | service 内嵌 + AI 评估 |

---

## 改动连带更新

- 新维度 / 查重层 → 本文件 + `DOMAIN_INDEX.md` + `DATA_MODEL.md`（若改表）
- 新路由 → 运行 `npm run docs:api-index`
