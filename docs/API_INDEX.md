# API 路由索引（L4）

> 路径均相对于站点根。人工说明见下文；**路由表由脚本自动维护**。

## 使用说明

- 新增或修改 Route Handler 后执行：`npm run docs:api-index`
- 写操作应接入 `validateBody` + `@/lib/validations`（见工程队列 ENG-PR-023/024）
- Admin 路由必须在 handler 开头 `requireAdmin()`
- 流式接口事件形状：写作见 `src/contracts/sse.ts`；查重 v2 进度为独立 JSON 事件


<!-- API_INDEX:AUTO:START -->
## 路由表（自动生成）

> 由 `npm run docs:api-index` 扫描 `src/app/api` 下全部 `route.ts` 生成。 更新时间：**2026-06-02 01:45:47**（共 **57** 个 route 文件，validateBody **23**，SSE **9**，requireAdmin **13**）。

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
| PATCH | `/api/projects/[id]/meta` | ✓ | — | — |
| PATCH | `/api/projects/[id]/references` | ✓ | — | — |
| PATCH | `/api/projects/[id]/sections/[key]` | ✓ | — | — |

### AI 写作

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| POST | `/api/writing` | ✓ | ✓ | — |

### 大纲

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| POST | `/api/outline` | ✓ | ✓ | — |

### 文献对话

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| POST | `/api/chat` | ✓ | ✓ | — |

### 知识库

| 方法 | 路径 | zod | SSE | admin |
|------|------|-----|-----|-------|
| GET, POST, PATCH, DELETE | `/api/knowledge` | ✓ | — | — |
| POST | `/api/knowledge/analyze` | — | — | — |
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
| GET, PATCH, DELETE | `/api/admin/users` | ✓ | — | ✓ |
| GET | `/api/admin/users/[id]` | — | — | ✓ |
<!-- API_INDEX:AUTO:END -->

## 人工备注（不随脚本覆盖）

### 写作 SSE 事件类型

见 [`domain/writing-pipeline.md`](./domain/writing-pipeline.md) 与 `src/contracts/sse.ts`。

### 查重 v2 SSE

`Accept: text/event-stream` 时事件：`progress` | `done` | `error`（非 WritingSSE 联合类型）。

### 尚未接入 validateBody 的常见路由

脚本标记为「—」的条目，改接口时请优先补 zod schema。典型：部分 `chart` / `xrd` / `export` / 只读 GET。

### Admin 分组

凡路径以 `/api/admin` 开头均需管理员；列表见自动生成表中 admin=✓ 的行。

