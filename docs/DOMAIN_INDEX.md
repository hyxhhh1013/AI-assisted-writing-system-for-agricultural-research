# 领域代码索引（L2）

> 功能 → 入口页面 → API → 核心 lib/service。改功能前先查本表，再 `rg`。  
> **产品主轴**：`Direction → Project（PaperPassport/Cockpit）→ /workbench`。战略状态见 [`MASTER_PLAN.md`](./MASTER_PLAN.md) §0。

## 工作台与项目

| 功能 | 页面 | API | 核心代码 |
|------|------|-----|----------|
| 工作台主界面 | `src/app/workbench/page.tsx` | `GET/PATCH /api/projects` | `useProjectLoader`, `useAutoSave`, `useEditorSync` |
| PaperPassport / Cockpit | 工作台 `structure` 侧栏顶部 | `PATCH .../paper-passport`；`POST .../sync` | `project-cockpit-bar.tsx`, `paper-config-panel.tsx`, `paper-passport-*.ts` |
| 章节编辑保存 | 同上 | `PATCH .../sections/[key]` | `src/services/projects.ts` |
| 参考文献 | 工作台侧栏 | `PATCH .../references` | `useReferenceReorder`, `contracts/project.ts` |
| 分析结果 | 工作台 `data` Tab | `PATCH .../analysis-results` | `patchAnalysisResults` service |
| 项目列表 | `src/app/projects/page.tsx` | `/api/projects` | — |

### 工作台 Tab（`workbench-tab-switcher.tsx`）

| Tab | 职责 |
|-----|------|
| `structure` | 章节 + 参考文献 + Cockpit |
| `data` | 实验数据 / AI 分析（主入口；旧 `/analysis` 重定向至此） |
| `xrd` | 工作台内嵌 XRD |
| `outline` | 论证提纲 / 写作蓝图 / **Phase 3 论证蓝图**（旧 `/outline` 重定向至此） |
| `writing` | 协作扩写流水线（旧 `/writing` 重定向至此） |
| `agent` | AI Agent（需 `NEXT_PUBLIC_AGENT_ENABLED=1`；写工具需 `AGENT_WRITE_ENABLED=1`） |
| `reader` | 补录参考文献 |
| `plagiarism` | 查重侧栏（精简）；完整质量中心见 `/plagiarism` |

## AI 写作

| 功能 | 页面 | API | 核心代码 |
|------|------|-----|----------|
| 扩写流水线 | 工作台 `writing` Tab | `POST /api/writing` SSE；`POST /api/writing/retrieve-preview` | `api/writing/pipeline/*`, `services/writing-context.ts`；注入 `writingBlueprint` + **已确认** `argumentBlueprint` |
| AI Agent | 工作台 `agent` Tab | `POST /api/agent` SSE | `lib/agent/langgraph/*`（编排），`lib/agent/core/agent-loop.ts`（入口），`services/agent.ts` |
| 证据中心 | 工作台 `data` | — | `evidence-hub-sections.tsx`、`data-panel.tsx` |
| 配图编辑 | 写作面板内联 | — | `writing-figure-edit-links.tsx` |
| 大纲生成 | 工作台 `outline` Tab | `POST /api/outline` SSE | `outline-panel.tsx`, `lib/prompts/outline.ts` |
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
| 统一质量中心 | `src/app/plagiarism/page.tsx` | `/api/plagiarism/v2` SSE | `QualityWorkspace`、`quality-persist.ts`、`quality-restore.ts` |
| 审查 Tab | `/plagiarism?tab=review` | `POST /api/review` | `review-tab.tsx`、`review-service.ts` |
| 查重 | 质量中心 | `POST /api/plagiarism/v2` | `plagiarism-service.ts`、`use-plagiarism-check` |
| 降重改写 | 质量中心降重 Tab | `/api/plagiarism/rewrite` | `rewrite-service.ts`、`rewrite-view.tsx` |
| 匹配预览 | 查重结果 | — | `match-content-preview.tsx` |
| 历史统计 | 质量中心底部 | `GET /api/plagiarism/history`、`GET /api/review/history` | `stats-report.tsx` |
| 数据分析（主入口） | 工作台 `data` Tab | `/api/analysis`, `/api/data/analyze` | `data-panel.tsx`, `contracts/data-source.ts` |

详见 [`domain/review-plagiarism.md`](./domain/review-plagiarism.md)。

## 大纲与蓝图

| 功能 | 页面 | API | 核心代码 |
|------|------|-----|----------|
| 大纲生成 | 工作台 `outline` Tab | `POST /api/outline` SSE | `outline-panel.tsx`、`lib/prompts/outline.ts` |
| 写作蓝图（Phase 2） | 提纲侧栏 → 蓝图弹窗 | `POST /api/outline/blueprint` | `blueprint-workspace.tsx`、`contracts/writing-blueprint.ts` |
| 蓝图恢复 | 工作台 | — | `blueprint-utils.ts`、`project-writing-blueprint-db.ts` |
| 蓝图编辑器 | 工作台提纲 | — | `use-blueprint-editor.ts`、`blueprint-workspace-dialog.tsx` |
| Argument Blueprint（Phase 3） | 工作台 `outline` Tab 顶部 | `PUT .../argument-blueprint`；`POST /api/outline/argument-blueprint` | `argument-blueprint-panel.tsx`、`contracts/argument-blueprint.ts` |
| 双语摘要 | 元数据对话框 | `POST /api/abstract/bilingual` | `abstract-bilingual-button.tsx`、`services/abstract.ts` |
| 导出过关（Phase 7） | 编辑器工具栏导出 | `POST .../paper-passport/export` | `markPaperPassportExport` |

## Admin

| 功能 | 页面 | API | 核心代码 |
|------|------|-----|----------|
| 后台布局（RSC 鉴权） | `admin/layout.tsx`, `admin-shell.tsx` | — | `lib/admin-auth-page.ts` |
| 全局搜索 | `admin-global-search.tsx` | `GET /api/admin/search` | Ctrl+K |
| 仪表盘 | `admin/page.tsx` | `GET /api/admin/stats` | `admin-dashboard-client.tsx` |
| 用户/项目 | `admin/users`, `projects` | `/api/admin/users`, `projects` | `admin-data-table.tsx`, `use-admin-list.ts` |
| 文献运维 | `admin/knowledge` | `GET/POST/DELETE /api/admin/knowledge` | 索引状态、SSE 重索引 |
| 审查/查重记录 | `admin/reviews`, `plagiarism` | `/api/admin/reviews`, `plagiarism` | `admin-record-project-links.tsx` |
| 使用统计 | `admin/usage` | `GET /api/admin/usage`, `usage/trends` | `services/admin-usage.ts` |
| 系统健康 | `admin/health` | `GET /api/admin/health` | 可点击告警 |
| 设置/Key | `admin/settings` | `PUT /api/admin/settings` | `lib/settings.ts` |

详见 [`ADMIN_ENHANCEMENT_PLAN.md`](./ADMIN_ENHANCEMENT_PLAN.md)。

## 研究方向战略规划

> 设计文档：[`superpowers/specs/2026-07-04-direction-planning-design.md`](./superpowers/specs/2026-07-04-direction-planning-design.md)

| 功能 | 页面 | API | 核心代码 |
|------|------|-----|----------|
| 方向列表/概览 | **主页** `/`（`DirectionsOverview`）；`/directions` → 重定向 `/` | `GET/POST /api/directions`；`GET .../summary` | `directions-overview.tsx` |
| 方向工作台 | `src/app/directions/[slug]/` | `GET/PUT/DELETE /api/directions/[slug]` | `direction-page-client.tsx` |
| 资产盘点 | Phase 0 | `PATCH .../assets` · `GET .../scan` · `POST .../parse-asset` | `direction-asset-intake-panel.tsx`, `lib/direction-asset-health.ts` |
| 预承诺 | Phase 1 | `POST .../evaluation-contract` | `direction-pre-commitment-panel.tsx`, `lib/direction-pre-commitment.ts` |
| 8 维度分析 | Phase 2 | `POST .../analyze` (SSE) | `direction-analysis-panel.tsx`, `direction-phase-readiness.ts` |
| 论文路线图 | Phase 3 | `POST/PATCH .../roadmap` · `GET .../paper-brief` | `direction-roadmap-timeline.tsx` |
| 文献语料 / handoff | 路线图 | `.../literature-corpus` 等 | `direction-literature-corpus.ts`, `literature-handoff-dialog.tsx` |
| 申报材料 | Phase 4 | `POST .../grant-proposal` | `direction-grant-panel.tsx` |
| **→ 写作桥接** | 路线图「开始写作」 | `GET .../paper-brief` → `POST /api/projects` | `direction-writing-bridge.ts`, `contracts/paper-passport.ts` |

**Prompt 族**：`src/lib/prompts/direction.ts` 等（见该目录 `direction-*.ts`）  
**种子脚本**：`node scripts/seed-directions.mjs`

## 兼容重定向（勿再当主入口）

| 旧路由 | 去向 |
|--------|------|
| `/directions` | `/` |
| `/outline?id=` | `/workbench?id=&tab=outline` |
| `/writing?id=` | `/workbench?id=&tab=writing` |
| `/analysis?id=` | `/workbench?id=&tab=data` |
| `/review?id=` | `/plagiarism?id=&tab=review` |

独立深读仍可用：`/reader?file=`（知识库 PDF）；产品路线图展示 `/roadmap`（≠ Direction 论文路线图）。

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
