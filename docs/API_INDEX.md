# API 路由索引（L4）

> 路径均相对于站点根。人工说明见下文；**路由表由脚本自动维护**。

## 使用说明

- 新增或修改 Route Handler 后执行：`npm run docs:api-index`
- 写操作应接入 `validateBody` + `@/lib/validations`（见工程队列 ENG-PR-023/024）
- Admin 路由必须在 handler 开头 `requireAdmin()`
- 流式接口事件形状：写作见 `src/contracts/sse.ts`；查重 v2 进度为独立 JSON 事件


<!-- API_INDEX:AUTO:START -->
## 路由表（自动生成）

> 由 `npm run docs:api-index` 扫描 `src/app/api` 下全部 `route.ts` 生成。 更新时间：**2026-07-06 09:27:16**（共 **80** 个 route 文件，validateBody **37**，SSE **11**，requireAdmin **15**）。

图例：zod = 使用 validateBody；SSE = 含 text/event-stream / ReadableStream；admin = 含 requireAdmin。

### 认证

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| POST | `/api/auth/login` | — | — | — |
| POST | `/api/auth/logout` | — | — | — |
| GET | `/api/auth/me` | — | — | — |
| POST | `/api/auth/register` | — | — | — |

### 项目

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| GET, POST, PATCH, DELETE | `/api/projects` | ✓ | — | — |
| PATCH | `/api/projects/[id]/analysis-results` | ✓ | — | — |
| PATCH | `/api/projects/[id]/charts` | ✓ | — | — |
| PATCH | `/api/projects/[id]/meta` | ✓ | — | — |
| POST | `/api/projects/[id]/paper-passport/sync` | — | — | — |
| PATCH | `/api/projects/[id]/references` | ✓ | — | — |
| POST | `/api/projects/[id]/references/import-external` | ✓ | — | — |
| PATCH | `/api/projects/[id]/sections/[key]` | ✓ | — | — |

### AI 写作

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| POST | `/api/writing` | ✓ | ✓ | — |
| POST | `/api/writing/retrieve-preview` | ✓ | — | — |

### 大纲

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| POST | `/api/outline` | ✓ | ✓ | — |
| POST | `/api/outline/blueprint` | ✓ | — | — |

### 文献对话

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| POST | `/api/chat` | ✓ | ✓ | — |

### 知识库

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| GET, POST, PATCH, DELETE | `/api/knowledge` | ✓ | — | — |
| POST | `/api/knowledge/analyze` | — | — | — |
| POST | `/api/knowledge/import-bibliography` | ✓ | — | — |
| POST | `/api/knowledge/reindex` | ✓ | ✓ | — |
| GET | `/api/knowledge/source` | — | — | — |

### 一致性

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| POST | `/api/consistency` | ✓ | — | — |
| POST | `/api/consistency/fix` | — | ✓ | — |

### 分析

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| POST | `/api/analysis` | ✓ | ✓ | — |

### 数据分析

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| POST | `/api/data/analyze` | — | — | — |

### 审查

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| POST | `/api/review` | ✓ | — | — |
| GET | `/api/review/[id]` | — | — | — |
| GET | `/api/review/history` | — | — | — |

### 查重

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| POST | `/api/plagiarism/check` | ✓ | ✓ | — |
| GET | `/api/plagiarism/history` | — | — | — |
| POST, PATCH | `/api/plagiarism/rewrite` | ✓ | — | — |
| POST | `/api/plagiarism/v2` | ✓ | ✓ | — |

### 参考文献工具

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| GET, POST | `/api/references` | — | — | — |

### 翻译

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| POST | `/api/translate` | ✓ | ✓ | — |

### 图表注册表

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| GET | `/api/figures/registry` | — | — | — |

### 图表生成

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| POST | `/api/chart` | — | — | — |

### 三线表

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| POST | `/api/table` | ✓ | — | — |

### XRD

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| POST | `/api/xrd/amorphous` | — | — | — |
| POST | `/api/xrd/bragg` | ✓ | — | — |
| POST | `/api/xrd/peakfit` | — | — | — |
| POST | `/api/xrd/simulate` | — | — | — |
| POST | `/api/xrd/unitcell` | — | — | — |
| POST | `/api/xrd/xps` | — | — | — |

### 流程图

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| POST | `/api/flow-diagram` | — | — | — |

### 分子图

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| POST | `/api/mol-diagram` | — | — | — |

### 导出

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| POST | `/api/export/pdf` | — | — | — |

### PDF

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| GET | `/api/pdf` | — | — | — |

### 保存图表

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| POST | `/api/save-chart` | — | — | — |

### 静态图表文件

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| GET | `/api/charts/[filename]` | — | — | — |

### Admin（需 requireAdmin）

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| GET | `/api/admin/health` | — | — | ✓ |
| POST | `/api/admin/journal-metrics` | — | — | ✓ |
| GET, DELETE, POST | `/api/admin/knowledge` | ✓ | — | ✓ |
| GET | `/api/admin/plagiarism` | — | — | ✓ |
| GET | `/api/admin/plagiarism/[id]` | — | — | ✓ |
| GET, DELETE | `/api/admin/projects` | ✓ | — | ✓ |
| GET | `/api/admin/reviews` | — | — | ✓ |
| GET | `/api/admin/reviews/[id]` | — | — | ✓ |
| GET | `/api/admin/search` | — | — | ✓ |
| GET, PUT, DELETE | `/api/admin/settings` | ✓ | — | ✓ |
| GET | `/api/admin/stats` | — | — | ✓ |
| GET | `/api/admin/usage` | — | — | ✓ |
| GET | `/api/admin/usage/trends` | — | — | ✓ |
| GET, PATCH, DELETE | `/api/admin/users` | ✓ | — | ✓ |
| GET | `/api/admin/users/[id]` | — | — | ✓ |

### 其他

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| POST | `/api/agent` | ✓ | ✓ | — |
| GET, POST | `/api/directions` | ✓ | — | — |
| GET, PUT, DELETE | `/api/directions/[slug]` | ✓ | — | — |
| POST | `/api/directions/[slug]/analyze` | ✓ | ✓ | — |
| PATCH | `/api/directions/[slug]/assets` | ✓ | — | — |
| POST | `/api/directions/[slug]/evaluation-contract` | ✓ | — | — |
| POST | `/api/directions/[slug]/experiment-plan` | — | — | — |
| POST | `/api/directions/[slug]/grant-proposal` | ✓ | — | — |
| GET | `/api/directions/[slug]/paper-brief` | — | — | — |
| POST | `/api/directions/[slug]/parse-asset` | — | — | — |
| PATCH, POST | `/api/directions/[slug]/roadmap` | ✓ | — | — |
| GET | `/api/directions/[slug]/scan` | — | — | — |
| GET | `/api/directions/summary` | — | — | — |
| POST | `/api/literature/search` | ✓ | — | — |
| GET | `/api/presentation/stats` | — | — | — |
<!-- API_INDEX:AUTO:END -->

## 人工备注（不随脚本覆盖）

### Admin 项目列表

- `GET /api/admin/projects`：query 支持 `q`、`template`、`mode`（`review` \| `research`）；进度 `progress` 按 `getCoreSectionKeysForMode` 计算；`outlineProgress` / `outlineTasksDone` / `outlineTasksTotal` 来自 `expandedOutlineSections` + 大纲解析。
- `GET /api/admin/stats`：响应含 `projectsByMode`（综述/研究项目数）。

### 写作 SSE 事件类型

见 [`domain/writing-pipeline.md`](./domain/writing-pipeline.md) 与 `src/contracts/sse.ts`。

### 知识库重建索引 SSE

- `POST /api/knowledge/reindex`：spawn `node scripts/index-pdfs.mjs --progress`；请求体见 `reindexRequestSchema`（`files?`, `forceStage1?`, `forceStage3?`）。
- 事件类型见 `src/contracts/reindex.ts`；必须以 `complete` 结束，否则客户端报「索引流意外结束」。
- 详情与排障：[`domain/rag-and-knowledge.md`](./domain/rag-and-knowledge.md)。

### 查重 v2 SSE

`Accept: text/event-stream` 时事件：`progress` | `done` | `error`（非 WritingSSE 联合类型）。

### 尚未接入 validateBody 的常见路由

脚本标记为「—」的条目，改接口时请优先补 zod schema。典型：部分 `chart` / `xrd` / `export` / 只读 GET。

### Admin 分组

凡路径以 `/api/admin` 开头均需管理员；列表见自动生成表中 admin=✓ 的行。

