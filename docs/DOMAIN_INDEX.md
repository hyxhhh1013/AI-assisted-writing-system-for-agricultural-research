# 领域代码索引（L2）

> 功能 → 入口页面 → API → 核心 lib/service。改功能前先查本表，再 `rg`。

## 工作台与项目

| 功能 | 页面 | API | 核心代码 |
|------|------|-----|----------|
| 工作台主界面 | `src/app/workbench/page.tsx` | `GET/PATCH /api/projects` | `useProjectLoader`, `useAutoSave`, `useEditorSync` |
| 章节编辑保存 | 同上 | `PATCH .../sections/[key]` | `src/services/projects.ts` |
| 参考文献 | 工作台侧栏 | `PATCH .../references` | `useReferenceReorder`, `contracts/project.ts` |
| 分析结果 | 工作台 | `PATCH .../analysis-results` | `patchAnalysisResults` service |
| 项目列表 | `src/app/projects/page.tsx` | `/api/projects` | — |

## AI 写作

| 功能 | 页面 | API | 核心代码 |
|------|------|-----|----------|
| 扩写流水线 | 工作台 `writing-panel` | `POST /api/writing` SSE；**096a** `POST /api/writing/retrieve-preview` | `api/writing/pipeline/*`, `services/writing-context.ts` |
| 证据中心 | 工作台侧栏 | — | `evidence-hub-sections.tsx`、`data-panel.tsx` |
| 配图编辑 | 写作面板内联 | — | `writing-figure-edit-links.tsx` |
| 大纲生成 | `src/app/outline/page.tsx` | `POST /api/outline` SSE | `lib/prompts/outline.ts` |
| 一致性检查 | 工作台 | `POST /api/consistency` | `consistency/fix` |
| 翻译 | — | `POST /api/translate` | — |

详见 [`domain/writing-pipeline.md`](./domain/writing-pipeline.md)。

## 知识库与 RAG

| 功能 | 页面 | API | 核心代码 |
|------|------|-----|----------|
| 文献浏览/搜索 | `src/app/knowledge/page.tsx` | `GET /api/knowledge` | `lib/knowledge-metadata.ts` |
| RIS/BibTeX 书目导入 | 知识库页「导入书目」 | `POST /api/knowledge/import-bibliography` | `lib/bibliography-import.ts`, `lib/bib-import/*` |
| 外部文献检索 | 知识库页「外部检索」Tab | `POST /api/literature/search` | `lib/literature-search.ts`, `services/external-literature.ts` |
| 外部文献→参考文献 | 知识库页 | `POST /api/projects/:id/references/import-external` | `lib/ref-format.ts` |
| 重建索引 | 知识库页 | `POST /api/knowledge/reindex` | `scripts/index-pdfs.mjs` |
| 书目自动解析 | （索引 Stage 1） | — | `scripts/doc-type-registry.mjs`, `scripts/extractors/*` |
| 引用括号归一化 | 扩写/预览/应用章节 | — | `src/lib/citation-bounds.ts`, `src/lib/citation.ts` |
| 文献对话 | — | `POST /api/chat` SSE | `lib/rag.ts` |
| 写作检索上下文 / 预览 | `writing-retrieve-preview` service | `POST /api/writing/retrieve-preview` | `services/writing-context.ts` |

详见 [`domain/rag-and-knowledge.md`](./domain/rag-and-knowledge.md)。

## 图表与 XRD

| 功能 | 页面 | API | 核心代码 |
|------|------|-----|----------|
| 图表工作台 | `src/app/plot/page.tsx` | `GET /api/figures/registry` | `scripts/charts/registry.json` |
| 通用图表 | plot / 工作台 | `POST /api/chart` | `scripts/charts/chart_base.py` |
| 三线表 | — | `POST /api/table` | Python table 模块 |
| XRD 实验室 | `src/app/xrd-lab/page.tsx` | `/api/xrd/*` | `scripts/charts/chart_types/` |

详见 [`domain/figures-and-python.md`](./domain/figures-and-python.md)。

## 审查与查重

| 功能 | 页面 | API | 核心代码 |
|------|------|-----|----------|
| 统一质量中心 | `src/app/plagiarism/page.tsx`（查重 Tab）| `/api/plagiarism/v2` SSE | `QualityWorkspace`、`quality-persist.ts`、`quality-restore.ts` |
| 审查 Tab | `/plagiarism?tab=review`（内联） | `POST /api/review` | `review-tab.tsx`、`review-service.ts` |
| 查重 | 质量中心 | `POST /api/plagiarism/v2` | `plagiarism-service.ts`、`use-plagiarism-check` |
| 降重改写 | 质量中心降重 Tab | `/api/plagiarism/rewrite` | `rewrite-service.ts`、`rewrite-view.tsx`（支持写回） |
| 匹配预览 | 查重结果 | — | `match-content-preview.tsx` |
| 历史统计 | 质量中心底部 | `GET /api/plagiarism/history`、`GET /api/review/history` | `stats-report.tsx` |
| 数据源分析 | `src/app/analysis/page.tsx` | `/api/analysis`, `/api/data/analyze` | `contracts/data-source.ts` |

## 大纲与蓝图

| 功能 | 页面 | API | 核心代码 |
|------|------|-----|----------|
| 大纲生成 | `src/app/outline/page.tsx` | `POST /api/outline` SSE | `outline-panel.tsx`、`lib/prompts/outline.ts` |
| 写作蓝图 | 大纲页 → 蓝图弹窗 | `POST /api/outline/blueprint` | `blueprint-workspace.tsx`、`contracts/writing-blueprint.ts` |
| 蓝图恢复 | 工作台 | — | `blueprint-utils.ts`、`project-writing-blueprint-db.ts` |
| 蓝图编辑器 | 大纲页 | — | `use-blueprint-editor.ts`、`blueprint-workspace-dialog.tsx` |

详见 [`domain/review-plagiarism.md`](./domain/review-plagiarism.md)。

## Admin

| 功能 | 页面 | API | 核心代码 |
|------|------|-----|----------|
| 后台布局（RSC 鉴权） | `admin/layout.tsx`, `admin-shell.tsx` | — | `lib/admin-auth-page.ts` |
| 全局搜索 | `admin-global-search.tsx` | `GET /api/admin/search` | Ctrl+K |
| 仪表盘 | `admin/page.tsx` | `GET /api/admin/stats` | `admin-dashboard-client.tsx` |
| 用户/项目 | `admin/users`, `projects` | `/api/admin/users`, `projects` | `admin-data-table.tsx`, `use-admin-list.ts`, `admin-stat-card.tsx` 等视觉组件 |
| 文献运维 | `admin/knowledge` | `GET/POST/DELETE /api/admin/knowledge` | 索引状态、SSE 重索引、`admin-knowledge-map.ts` |
| 审查/查重记录 | `admin/reviews`, `plagiarism` | `/api/admin/reviews`, `plagiarism` | `admin-record-project-links.tsx` |
| 使用统计 | `admin/usage` | `GET /api/admin/usage`, `usage/trends` | `services/admin-usage.ts` |
| 系统健康 | `admin/health` | `GET /api/admin/health` | 可点击告警 |
| 设置/Key | `admin/settings` | `PUT /api/admin/settings` | `lib/settings.ts` |

详见 [`ADMIN_ENHANCEMENT_PLAN.md`](./ADMIN_ENHANCEMENT_PLAN.md)。

## 认证与导出

| 功能 | 页面 | API | 核心代码 |
|------|------|-----|----------|
| 登录注册 | `login`, `register` | `/api/auth/*` | `proxy.ts` |
| PDF 导出 | 工作台 | `/api/export/pdf`, `/api/pdf` | Playwright |
| DOCX | 工作台 hook | — | `useDocxExport` |

## Prompt 子系统

| 域 | 文件 |
|----|------|
| 写作/扩写 | `src/lib/prompts/writing.ts` |
| 综述章节 | `src/lib/prompts/review-writing.ts` |
| 大纲 | `src/lib/prompts/outline.ts` |
| 数据分析 | `src/lib/prompts/analysis.ts` |
| 一致性 | `src/lib/prompts/consistency.ts` |
| 农业领域 | `src/lib/prompts/domain.ts` |
| 统一出口 | `src/lib/prompts.ts` |
