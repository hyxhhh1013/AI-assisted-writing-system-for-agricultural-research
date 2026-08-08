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
| 写作 Agent 引导 | `src/app/academic-paper/page.tsx` | Project 列表 | `academic-paper-studio/components/AgentGuidePage.tsx` → `/workbench?tab=agent` |

### 工作台 Tab（`workbench-tab-switcher.tsx`）

| Tab | 职责 |
|-----|------|
| `structure` | 章节 + 参考文献 + Cockpit |
| `data` | 实验数据 / AI 分析（主入口；旧 `/analysis` 重定向至此） |
| `xrd` | 工作台内嵌 XRD |
| `outline` | 论证提纲 / 写作蓝图（旧 `/outline` 重定向至此） |
| `writing` | 协作扩写流水线（旧 `/writing` 重定向至此） |
| `agent` | AI Agent（需 `NEXT_PUBLIC_AGENT_ENABLED=1`；写工具需 `AGENT_WRITE_ENABLED=1`） |
| `reader` | 补录参考文献 |
| `plagiarism` | 查重侧栏（精简）；完整质量中心见 `/plagiarism` |

> **移动端响应式（2026-08-08）**：窄屏（< 1024px，手机/平板竖屏）下自动隐藏左侧图标栏（`WorkbenchTabSwitcher`）与动态侧栏、关闭预览，只留编辑器全宽（`workbench-page-client.tsx` 的 `isMobileLayout` + `matchMedia`）。宽屏恢复三栏。侧栏收起的展开浮钮窄屏贴左边缘（`left-0`），宽屏贴图标栏（`left-14`）。

## AI 写作

| 功能 | 页面 | API | 核心代码 |
|------|------|-----|----------|
| 扩写流水线 | 工作台 `writing` Tab | `POST /api/writing` SSE；`POST /api/writing/retrieve-preview` | `api/writing/pipeline/*`, `services/writing-context.ts` |
| AI Agent | 工作台 `agent` Tab | `POST /api/agent` SSE；`GET /api/agent/sessions`（`history=1`） | Phase0 问答配置；行为 eval；**质量主轴**见 [`plans/W3-AP-QUALITY.md`](./plans/W3-AP-QUALITY.md)；行为底稿 [`W3-AP-BEHAVIOR.md`](./plans/W3-AP-BEHAVIOR.md) |
| 产品门禁评测 | 本地/CI | `npm run eval:gates`；可选 `npm run eval:pipeline` | `lib/eval/product-gates.ts`、`scripts/eval-pipeline-paper.ts` |
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
| 外部文献→参考文献 | 知识库页 | `POST /api/projects/:id/references/import-external` | `lib/ref-format.ts`、`lib/external-literature-format.ts`（GB/T 7714：≤3 作者全列，>3 前 3 + 等） |
| 重建索引 | 知识库页 | `POST /api/knowledge/reindex` | `scripts/index-pdfs.mjs` |
| 书目自动解析 | （索引 Stage 1） | — | `scripts/doc-type-registry.mjs`, `scripts/extractors/*` |
| 引用括号归一化 | 扩写/预览/应用章节 | — | `src/lib/citation-bounds.ts`, `src/lib/citation.ts` |
| 文献对话 | — | `POST /api/chat` SSE | `lib/rag.ts` |
| 写作检索上下文 / 预览 | `writing-retrieve-preview` service | `POST /api/writing/retrieve-preview` | `services/writing-context.ts` |

详见 [`domain/rag-and-knowledge.md`](./domain/rag-and-knowledge.md)。

## 图表与 XRD / DFT

| 功能 | 页面 | API | 核心代码 |
|------|------|-----|----------|
| 图表工作台 | `src/app/plot/page.tsx` | `GET /api/figures/registry` | `scripts/charts/registry.json` |
| 通用图表（含 Origin 向） | plot / 工作台 | `POST /api/chart` | `scripts/charts/chart_base.py`、`chart_types/` |
| 三线表 | — | `POST /api/table` | Python table 模块 |
| XRD / Jade | `/plot` XRD 分类 · `/xrd-lab` | `/api/xrd/*`（含 stack、scherrer） | `xrd_*.py`、`components/shared/xrd/` |
| DFT 能带 / DOS（CSV） | `/plot` DFT 分类 | `POST /api/chart` | `chart_types/dft_band.py`、`dft_dos.py` |
| VASP DOSCAR / EIGENVAL / PROCAR | `/plot` DFT · VASP | `POST /api/dft/vasp` | `vasp_io.py`、`dft_vasp.py`、`dft_procar.py`、`components/shared/dft/` |
| 期刊流程图 | `/plot` 示意图 · 流程图 | `POST /api/flow-diagram` | `flow_diagram_v2.py`、`flow-card.tsx` |
| Mermaid 机理草图 | `/plot` 示意图 · Mermaid | 前端 Mermaid → `save-chart` | `mermaid-mechanism-card.tsx` |
| 多面板机理图 a/b/c | `/plot` 示意图 · 多面板 | `POST /api/mechanism-panel` | `mechanism_panel.py`、`mechanism-panel-card.tsx` |
| 仪器 .xy/.ras | XRD 各工具上传 | 经 `load_dataframe` | `instrument_io.py`、`lib/xrd-file-ext.ts` |
| 科研作图队列 | — | — | [`plans/FIG-PR-scientific-plotting.md`](./plans/FIG-PR-scientific-plotting.md) |

详见 [`domain/figures-and-python.md`](./domain/figures-and-python.md)。

## 审查与查重

| 功能 | 页面 | API | 核心代码 |
|------|------|-----|----------|
| 统一质量中心 | `src/app/plagiarism/page.tsx` | `/api/plagiarism/v2` SSE | `QualityWorkspace`、`quality-persist.ts`、`quality-restore.ts` |
| 审查 Tab | `/plagiarism?tab=review` | `POST /api/review`；`POST /api/review/rounds` | `review-tab.tsx`、`review-service.ts`、`lib/review-rounds.ts` |
| 引用硬检 | Passport Phase 5 / PDF 导出 | `GET|POST /api/citations/gate` | `lib/citation-gate.ts`、`services/citations.ts` |
| 引用语义接地 | Agent `validate_citations` / inspect |（工具内） | `lib/citation-grounding.ts`、`contracts/citation-grounding.ts`（W3-AP-CITE-GROUND） |
| 分节完整度 | Agent inspect / 简报 |（工具内） | `lib/draft-coverage.ts`、`contracts/draft-coverage.ts`（W3-AP-DRAFT-COVER） |
| 查重 | 质量中心 | `POST /api/plagiarism/v2` | `plagiarism-service.ts`、`use-plagiarism-check` |
| 降重改写 | 质量中心降重 Tab | `/api/plagiarism/rewrite` | `rewrite-service.ts`、`rewrite-view.tsx` |
| 匹配预览 | 查重结果 | — | `match-content-preview.tsx` |
| 历史统计 | 质量中心底部 | `GET /api/plagiarism/history`、`GET /api/review/history` | `stats-report.tsx` |
| 数据分析（主入口） | 工作台 `data` Tab | `/api/analysis`, `/api/data/analyze` | `data-panel.tsx`, `contracts/data-source.ts` |

详见 [`domain/review-plagiarism.md`](./domain/review-plagiarism.md)。

## 大纲与蓝图

| 功能 | 页面 | API | 核心代码 |
|------|------|-----|----------|
| 扩写管道 | 工作台写作 | `POST /api/writing` SSE | `run-pipeline` + `pipeline/verifier`（结构化 `review_report`） |
| 写作蓝图（Phase 2） | 提纲侧栏 → 蓝图弹窗 | `POST /api/outline/blueprint` | `blueprint-workspace.tsx`、`contracts/writing-blueprint.ts` |
| 蓝图恢复 | 工作台 | — | `blueprint-utils.ts`、`project-writing-blueprint-db.ts` |
| 蓝图编辑器 | 工作台提纲 | — | `use-blueprint-editor.ts`、`blueprint-workspace-dialog.tsx` |
| Argument Blueprint（Phase 3） | 工作台提纲侧栏 | `POST /api/outline/argument-blueprint` | `contracts/argument-blueprint.ts`、`outline-argument-summary.tsx`、`agent/tools/build-argument-blueprint.ts`（≠ writing-blueprint） |
| 双语摘要（Phase 5b） | Agent / 项目设置 | `POST /api/abstract/bilingual` | `bilingual-abstract-controls.tsx`、`services/bilingual-abstract.ts` |

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
| 设置/Key+模型 | `admin/settings` | `PUT /api/admin/settings` | `lib/settings.ts` + `resolveProviderModel`（`DEEPSEEK_MODEL`/`ZHIPU_MODEL` 热加载） |

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
| DOCX | 工作台 hook | 引用硬检 + 双语 + 题注 | `useDocxExport`、`lib/export-readiness.ts` |
| PDF 导出 | 工作台 / API | `POST /api/export/pdf`（同硬检） | `services/pdf-export.ts`、`export-readiness` |

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
