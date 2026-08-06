# 禾书耕文（GrainScript）— 代码审计报告

> 审计日期：2026-07-05
> 审计范围：全项目（src/、scripts/、prisma/、docs/）
> 审计重点：资产清点板块、写作板块数据连接性、全项目冗余检测

---

## 目录

1. [项目全局结构](#一项目全局结构)
2. [资产清点板块深度分析](#二资产清点板块深度分析)
3. [写作板块数据连接性](#三写作板块数据连接性)
4. [冗余与重复功能清单](#四冗余与重复功能清单)
5. [导航与返回逻辑](#五导航与返回逻辑)
6. [图表/作图板块](#六图表作图板块)
7. [架构与代码质量问题](#七架构与代码质量问题)
8. [建议优先级排序](#八建议优先级排序)

---

## 一、项目全局结构

### 1.1 基本信息

| 属性 | 值 |
|------|-----|
| 框架 | Next.js 16 App Router + Turbopack |
| UI | Tailwind v4 + Shadcn |
| 编辑器 | TipTap / Textarea |
| 数据库 | Prisma + PostgreSQL |
| 认证 | JWT + HTTP-only cookie |
| AI 模型 | DeepSeek（写作）+ Zhipu（审查/校验） |
| RAG | BM25 + 向量 RRF，本地二进制索引 |
| 图表 | Python matplotlib/rdkit 子进程 |
| 语言 | TypeScript（前端）+ Python（图表）+ TypeScript（后端 API） |

### 1.2 目录职责

| 目录 | 职责 | 文件数（约） |
|------|------|------------|
| `src/app/api/` | 78 个路由文件，93 个 HTTP method 导出 | ~80 |
| `src/app/` | 16 个页面（含 admin 子路由） | ~30 |
| `src/components/shared/` | 业务组件，按域分目录 | ~120 |
| `src/contracts/` | 前后端共享类型定义 | ~20 |
| `src/services/` | API 调用封装（client + server） | 36 |
| `src/hooks/` | React 状态与副作用管理 | ~40 |
| `src/lib/` | prompts、RAG、AI、Prisma 等核心逻辑 | ~55 |
| `scripts/charts/` | Python 图表生成 | ~30 |
| `prisma/` | 数据库 Schema | 1 |

### 1.3 API 路由全景

#### 写作与 AI（6 个路由）

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/writing` | POST | 五阶段写作管道（检索→写作→核查→修正→定稿），SSE 流式，最长 600s |
| `/api/writing/retrieve-preview` | POST | 写作前 RAG 检索预览，最长 120s |
| `/api/chat` | POST | AI 科研助手对话，SSE 流式 |
| `/api/translate` | POST | 学术文本中英互译，SSE 流式 |
| `/api/outline` | POST | AI 生成论文大纲 |
| `/api/outline/blueprint` | POST | 基于大纲生成写作蓝图 (JSON) |

#### 研究方向与资产清点（13 个路由）

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/directions` | GET/POST | 研究方向列表/创建 |
| `/api/directions/summary` | GET | 首页概览卡片数据 |
| `/api/directions/[slug]` | GET/PUT/DELETE | 单个方向 CRUD |
| `/api/directions/[slug]/assets` | PATCH | **资产清点核心**：增量更新实验/论文/数据集资产 |
| `/api/directions/[slug]/scan` | GET | 从知识库和已有项目扫描候选资产 |
| `/api/directions/[slug]/parse-asset` | POST | AI：自然语言→结构化资产 |
| `/api/directions/[slug]/analyze` | POST | 10 维全景分析，SSE 流式 |
| `/api/directions/[slug]/roadmap` | POST/PATCH | 论文发表路线图生成/更新 |
| `/api/directions/[slug]/paper-brief` | GET | 提取写作所需文献清单 |
| `/api/directions/[slug]/experiment-plan` | POST | 实验方案生成 |
| `/api/directions/[slug]/evaluation-contract` | POST | 预承诺评价标准 |
| `/api/directions/[slug]/grant-proposal` | POST | 基金申请书生成 |

#### 知识库与 RAG（7 个路由）

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/knowledge` | GET/POST/PATCH/DELETE | 知识库 CRUD + PDF 上传解析 |
| `/api/knowledge/analyze` | POST | AI 分析单个 chunk |
| `/api/knowledge/import-bibliography` | POST | 批量书目导入 |
| `/api/knowledge/reindex` | POST | 全量重建索引，SSE 流式进度 |
| `/api/knowledge/source` | GET | 按文件名获取 chunks |
| `/api/literature/search` | POST | 外部文献检索 |
| `/api/pdf` | GET | 代理读取 PDF 原文 |

#### 图表与可视化（6 个路由）

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/chart` | POST | 通用 matplotlib 图表生成 |
| `/api/charts/[filename]` | GET | 已生成图表文件读取 |
| `/api/save-chart` | POST | 图表文件落盘保存 |
| `/api/figures/registry` | GET | 统一图形注册表 |
| `/api/flow-diagram` | POST | 流程图渲染 |
| `/api/mol-diagram` | POST | 分子结构图渲染 |
| `/api/table` | POST | 三线表生成 |

#### 审查与查重（7 个路由）

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/review` | POST | 四维度并行审查 |
| `/api/review/[id]` | GET | 审查详情 |
| `/api/review/history` | GET | 审查历史 |
| `/api/plagiarism/check` | POST | 查重检测（最长 180s） |
| `/api/plagiarism/history` | GET | 查重历史 |
| `/api/plagiarism/rewrite` | POST/PATCH | AI 改写建议 |
| `/api/plagiarism/v2` | POST | v2 查重，SSE 进度 |

#### 项目与数据（10 个路由）

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/projects` | GET/POST/PATCH/DELETE | 项目 CRUD + dataClaims/dataSources 增量更新 |
| `/api/projects/[id]/sections/[key]` | PATCH | 章节增量保存 |
| `/api/projects/[id]/references` | PATCH | 参考文献增量更新 |
| `/api/projects/[id]/references/import-external` | POST | 外部文献导入 |
| `/api/projects/[id]/analysis-results` | PATCH | 分析结果增量更新 |
| `/api/projects/[id]/charts` | PATCH | 图表资产 JSON 增量更新 |
| `/api/projects/[id]/meta` | PATCH | 项目元数据增量更新 |
| `/api/references` | GET/POST | 引用-文献映射管理 |
| `/api/analysis` | POST | AI 论文分析 |
| `/api/data/analyze` | POST | 统计分析 |
| `/api/export/pdf` | POST | 项目导出 PDF |

#### 认证与管理（20+ 个路由）

| 路由组 | 用途 |
|--------|------|
| `/api/auth/*` (4) | 注册、登录、登出、身份验证 |
| `/api/admin/*` (16) | 用户管理、项目管理、知识库管理、查重/审查管理、设置、统计、用量、健康检查 |
| `/api/consistency` + `/fix` (2) | 全文一致性检查与修复 |
| `/api/presentation/stats` | 演示统计数据 |

### 1.4 页面清单

| 页面路径 | 用途 |
|----------|------|
| `/` | 首页：产品 Hero、研究方向入口卡片 |
| `/workbench` | 工作台：论文编辑器 + 侧边栏（结构/数据/大纲/写作/知识库/查重/XRD） |
| `/directions/[slug]` | 研究方向详情：资产清点→预承诺→10维分析→路线图→基金申请 |
| `/plot` | 科学绘图：19 种图形类型（数据图/示意图/XRD/表格） |
| `/admin` | 管理后台：用户/项目/知识库/查重/审查/统计/用量/设置 |
| `/login` | 登录页 |
| `/register` | 注册页 |
| `/analysis` | 独立数据分析页 |
| `/knowledge` | 知识库管理页 |
| `/reader` | 文献阅读器 |
| `/xrd-lab` | XRD 实验室 |
| `/projects` | 项目列表 |

---

## 二、资产清点板块深度分析

### 2.1 概述

资产清点（Asset Inventory）是"研究方向战略规划"管线的 **Phase 0**，位于**研究方向层**（高于写作项目层），对一个研究方向的实验工作、发表论文、数据集进行结构化盘点。

### 2.2 资产类型

| 资产类型 | 关键字段 | 来源方式 |
|----------|---------|---------|
| **experiment** | title, dateRange, researchQuestion, methods, keyFindings, limitations, isNegativeResult, linkedDatasets, linkedPapers | 手动录入 / AI 自然语言解析 |
| **paper** | doi, title, journal, year, impactFactor, abstract, contribution, linkedExperiments | 手动 / 知识库扫描 / 已有项目发现 |
| **dataset** | title, filePath, variables, sampleSize, linkedExperiments | 手动 / dataClaims 扫描 |

### 2.3 完整管线（5 阶段）

```
P0: 资产清点（当前页）
  ├─ 手动录入：direction-asset-form.tsx
  ├─ AI 解析：POST /api/directions/[slug]/parse-asset
  ├─ 扫描发现：POST /api/directions/[slug]/scan（从知识库+项目）
  └─ 统计展示：direction-stat-cards.tsx + direction-dashboard.tsx
       ↓
P1: 预承诺（evaluation-contract）
  └─ 8 维评价标准草案生成 + 对话式校准
       ↓
P2: 全景分析（10 维 AI）
  └─ D1-D10 维度评分 + 论文候选识别 + 交叉矛盾检测
       ↓
P3: 论文路线图
  └─ 优先级排序 + 季度时间线 + 实验依赖 → "开始写作"按钮
       ↓
P4: 基金申请材料
  └─ 从全景分析和路线图生成基金申请书
```

### 2.4 关键文件清单

| 文件 | 行数 | 职责 |
|------|------|------|
| `src/contracts/direction.ts` | ~300 | 全部类型定义：资产、分析、路线图、DTO 转换 |
| `src/contracts/direction-writing-bridge.ts` | ~60 | 方向→写作桥接类型 |
| `src/services/direction.ts` | ~200 | 客户端 API 封装：CRUD + asset PATCH + 扫描 + 分析 + 桥接 |
| `src/services/direction-checks.ts` | ~100 | 反模式检测：数据充分性、实验完整性、期刊匹配 |
| `src/lib/direction-writing-bridge.ts` | ~150 | 服务端桥接：构建写作上下文（文献+主题+类型） |
| `src/lib/direction-calibration.ts` | ~80 | 评价标准校准（基于已发表论文的 IF 分布） |
| `src/lib/prompts/direction.ts` | ~400 | AI prompt 工程：评价标准/维度评分/候选论文/综合/路线图/实验方案 |
| `src/lib/validations.ts` | L695-725 | Zod 校验：directionCreate/Update/AssetsPatch |
| `prisma/schema.prisma` | L285-299 | Direction 模型：JSONB 存 assets/analysis/roadmap |
| **API 层（8 个 route 文件）** |
| `src/app/api/directions/route.ts` | GET/POST | 列表/创建 |
| `src/app/api/directions/summary/route.ts` | GET | 首页概览 |
| `src/app/api/directions/[slug]/route.ts` | GET/PUT/DELETE | 单方向 CRUD |
| `src/app/api/directions/[slug]/assets/route.ts` | PATCH | **资产增量更新（核心）** |
| `src/app/api/directions/[slug]/scan/route.ts` | GET | 三源扫描 |
| `src/app/api/directions/[slug]/analyze/route.ts` | POST | SSE 10维分析 |
| `src/app/api/directions/[slug]/roadmap/route.ts` | POST/PATCH | 路线图 |
| `src/app/api/directions/[slug]/parse-asset/route.ts` | POST | NL→结构化 |
| `src/app/api/directions/[slug]/paper-brief/route.ts` | GET | 写作上下文 |
| **UI 层（12 个组件）** |
| `direction-page-client.tsx` | ~500 | 5 阶段编排主页面 |
| `direction-asset-list.tsx` | 资产列表表格 |
| `direction-asset-form.tsx` | 资产录入表单（3 tab + NL 解析） |
| `direction-asset-scan-dialog.tsx` | 扫描发现弹窗 |
| `direction-stat-cards.tsx` | 4 卡片统计 |
| `direction-dashboard.tsx` | 综合仪表盘 + 下一步引导 |
| `direction-analysis-panel.tsx` | 10 维分析面板（雷达图+证据+矛盾） |
| `direction-analysis-charts.tsx` | 分析图表子组件 |
| `direction-roadmap-timeline.tsx` | 路线图甘特图 + "开始写作"按钮 |
| `direction-socratic-dialog.tsx` | 预承诺对话 |
| `direction-grant-panel.tsx` | 基金申请书面板 |
| `direction-card.tsx` | 首页方向卡片 |
| `paper-config-dialog.tsx` | 论文配置弹窗 |

### 2.5 数据流

```
用户输入（手动 / NL解析 / 扫描导入）
  → PATCH /api/directions/[slug]/assets
  → Prisma Direction.assets (JSONB)
  → direction-stat-cards（计数展示）
  → direction-dashboard（进度追踪）
  → scan route（扫描已知资产覆盖率）
  → analyze route（10维 AI 分析 → 写入 Direction.analysis）
  → roadmap route（路线图 → 写入 Direction.roadmap）
  → createProjectFromRoadmap（读 paper-brief → 创建写作项目 + 蓝图）
```

### 2.6 与写作板块的桥接

**唯一入口**：`src/services/direction.ts` → `createProjectFromRoadmap()`

调用链：
```
路线图的 "开始写作" 按钮
  → paper-config-dialog.tsx（配置论文类型/标题/级别）
  → createProjectFromRoadmap(slug, paper, themeAngle, level)
    → GET /api/directions/[slug]/paper-brief（获取文献+上下文）
    → POST /api/projects（创建项目，设置 researchDirection）
    → PATCH /api/projects/[id]/references（导入参考文献列表）
    → POST /api/outline/blueprint（生成 AI 写作蓝图）
    → PATCH /api/directions/[slug]/roadmap（同步路线图状态）
  → router.push(`/workbench?id=${newProjectId}`)
```

### 2.7 资产清点发现的问题

| # | 问题 | 影响 | 严重度 |
|---|------|------|--------|
| A1 | **Direction.assets 用纯 JSONB 存，无独立 Asset 表** | 资产无法跨方向复用，无法建索引查询，依赖 JSON 结构稳定性 | 高 |
| A2 | **路线图"写作蓝图"和项目级 WritingBlueprint 是两套独立类型** | `DirectionRoadmap.roadmap` 和 `WritingBlueprint` 没有共享基础类型，数据不一致风险 | 中 |
| A3 | **`Project.researchDirection` 单向引用** | 方向侧无法感知项目进度变化（从 writing→submitted→published），路线图手动更新 | 中 |
| A4 | **scan route 扫描结果无法"更新"已有资产** | 扫描发现的新资产可以直接导入，但已有资产不会自动同步（如论文状态变化） | 中 |
| A5 | **10维分析结果存入 JSONB，无法结构化查询** | 无法跨方向对比维度得分、筛选高分候选论文、统计矛盾模式 | 低 |
| A6 | **`direction-checks.ts` 定义的反模式检查未在创建项目前强制调用** | 可能创建数据不充分的写作项目 | 低 |
| A7 | **12 个 UI 组件过于碎片化** | `direction-asset-form.tsx` + `direction-asset-list.tsx` 可合并，小型弹窗可合并 | 低 |

---

## 三、写作板块数据连接性

### 3.1 架构概览

写作板块由以下层次构成：

```
UI 层:   workbench-page-client.tsx (2479行) + writing-panel.tsx (710行)
Hook 层: use-writing-panel-generate / use-writing-stream / use-writing-source-selection
         use-writing-panel-preview-sync / use-writing-panel-session / use-writing-bullet-expand
         use-ai-paragraph / use-figure-pipeline
服务层:  services/writing.ts / writing-context.ts / writing-retrieve-preview.ts
API 层:  /api/writing + /api/writing/retrieve-preview
管道层:  prepare-context → writer(DeepSeek) → verifier(Zhipu) → refiner(Zhipu) → finalize
Prompt:  lib/prompts/writing.ts（章节提示词 + writer/verifier/refiner 系统提示词）
```

### 3.2 完整数据流（详细追踪）

```
═══════════════════════════════════════════════════════════════════════
                        WORKBENCH（React 状态层）
project: ProjectData ← projectStore.get(id) ← Prisma PostgreSQL
editingContent: string     activeSection: string
aiPreview: { content, pipelineSteps, warnings, targetSection }
refCount: number           writingBlueprint: WritingBlueprint | null
═══════════╤═══════════════════════╤═══════════════════════════════════
           │ props                │ callbacks
           v                      v
═══════════════════════════════════════════════════════════════════════
  WritingPanel（左侧写作栏，~710 行）

  ┌─ useWritingSourceSelection ─────────────────────────────────────┐
  │ fetch() → POST /api/writing/retrieve-preview                     │
  │   → searchWritingRagChunks (service/writing-context.ts:83)       │
  │     → deriveScopeCategories(existingRefs) → 确定 RAG 类别范围     │
  │     → buildWritingRetrievalQuery() → 章节关键词增强查询            │
  │     → localRAG.search(query) → BM25+向量 RRF 混合检索             │
  │     → fallback query（0 结果时重试）                               │
  │   → buildRetrievePreviewFromChunks → 按源分组 + bib 元数据解析     │
  │   → hits[] with sourceKey, snippet, bib metadata                 │
  │ confirm → 设置 selectedSourceIds[] → 启用"生成"按钮               │
  └──────────────────────────────────────────────────────────────────┘
                              │
                              v
  ┌─ useWritingPanelGenerate.handleGenerate() ──────────────────────┐
  │ buildWritingRequest({                                            │
  │   title, section, context, bullets, language, template,          │
  │   existingReferences ← project.references,                       │
  │   researchDirection ← project.researchDirection,                 │
  │   retrievalMode ← precise|balanced|extensive,                    │
  │   selectedSourceIds ← sourceSelection.selectedSourceIds,         │
  │   dataClaims ← JSON.parse(project.dataClaims || "[]"),           │
  │   globalContext { abstract, outline, sectionPreviews,            │
  │     analysisResults, blueprint },                                │
  │   projectMode ← getProjectWritingMode(project.mode),             │
  │   citationStyle ← project.citationStyle,                         │
  │   figureStart ← countProjectFigures(project, targetSectionKey)   │
  │ })                                                               │
  │ → useWritingStream.start(request)                                │
  └──────────────────────────────────────────────────────────────────┘
                              │
                     HTTP POST (SSE, 最长 600s)
══════════════════════════════╪═══════════════════════════════════════
                              v
  /api/writing/route.ts (~130 行)
  ├─ validateBody(writingSchema) → Zod 校验
  ├─ resolveWritingDraftContext(context, bullets)
  ├─ getAgentModelConfig("writer"/"verifier"/"refiner") → Key 检查
  ├─ tryAcquireWritingSlot() → 并发控制
  └─ runWritingPipeline(params) ──────────────────────────────────┐
                                                                     │
  Stage 0: prepare-context.ts                                        │
  ├─ retrieveWritingContext(data, existingRefs)                      │
  │   ├─ searchWritingRagChunks() → localRAG.search()                │
  │   ├─ filterChunksBySelection(rawChunks, selectedSourceIds)       │
  │   │   undefined → 全部使用（兼容旧版）                              │
  │   │   []       → 空上下文（"未选择任何文献来源"）                    │
  │   │   [...]    → 仅保留匹配源                                      │
  │   ├─ 每个 chunk → 分配全局引用编号 [N]                              │
  │   ├─ 构建 refMapping, referencesByIndex, newSources               │
  │   └─ 构建 contextText（RAG chunks 格式化文本）                      │
  ├─ buildEvidencePack({ ragChunks: [] }) → dataClaims only           │
  ├─ resolveSectionPrompt(section, projectMode)                       │
  ├─ buildDomainExpertise(researchDirection)                          │
  ├─ buildWriterSystemPrompt({...})                                   │
  └─ → PreparedWritingContext {                                       │
       systemPrompt, resolvedSectionPrompt, contextText,              │
       refRangeHint, refMapping, referencesByIndex,                   │
       newSources, evidenceSummary, globalReferenceInfo               │
     }                                                                │
                                                                     │
  Stage 1: pipeline/writer.ts (DeepSeek)                              │
  ├─ 构建 userContent（bullets 模式 vs 上下文模式）                      │
  ├─ callAI({ provider: "deepseek", stream: true })                   │
  └─ streamAIResponse → SSE delta events → 前端                        │
                                                                     │
  Stage 2: pipeline/verifier.ts (Zhipu, fallback DeepSeek)           │
  ├─ collectCitationFirstAppearance(draft) → 确定引用了哪些文献          │
  ├─ localRAG.getFullText(sourceName) → 加载全文（前 N 篇完整，其余摘要）  │
  ├─ buildVerifierPrompt({ contextText, content, fullSourceTexts })    │
  ├─ callAI({ provider: "zhipu", stream: true, timeoutMs: 180000 })   │
  └─ → { verificationReport, failedVerificationIssues }               │
                                                                     │
  Stage 3: pipeline/refiner.ts (Zhipu, non-streaming, conditional)    │
  ├─ normalizeAllCitationFormats → 统一引用格式 [N]                     │
  ├─ stripOutOfRangeCitations → 移除超出范围的引用                       │
  ├─ IF failedVerificationIssues:                                      │
  │   ├─ buildRefinerPrompt({ contextText, feedback, content })        │
  │   └─ callAINonStreaming({ provider: "zhipu", timeoutMs: 180000 })  │
  └─ → { refinedDraft, correctedDraft }                                │
                                                                     │
  Stage 4: pipeline/finalize.ts                                        │
  ├─ emitDraftReferences(draft, prepared) → SSE references 事件         │
  ├─ validateCitations(draft, contextText) → 确定性文本重叠检查           │
  │   ├─ 提取 [N] 周围 160 字上下文                                      │
  │   ├─ 与 RAG 原文做关键词重叠度计算                                     │
  │   └─ OVERLAP_THRESHOLD = 0.08 → 不达标 emit citation_warnings       │
  ├─ validateDataClaims(draft, dataClaims) → 确定性数据声明检查            │
  ├─ emit({ type: "status", status: "completed" })                      │
  └─ finishStream() → "data: [DONE]\n\n"                                │
                                                                     │
══════════════════════════════╤═══════════════════════════════════════
                     SSE stream 返回
                              v
  useWritingStream (前端 hook)
  ├─ 解析 SSE event 类型:
  │   delta → resultRef += content (150ms throttle)
  │   status → setGenerationStatus(retrieving/writing/verifying/...)
  │   verification → verificationRef += verification
  │   corrected_text → resultRef 全文替换
  │   references → setDetectedRefs(references)
  │   citation_warnings → setCitationWarnings(warnings)
  │   data_claim_warnings → setDataClaimWarnings(warnings)
  │   [DONE] → flush result, setIsGenerating(false)
  └─ useWritingPanelPreviewSync → throttle 250ms → aiPreview (workbench)
                                     → SciPreview 右侧实时预览
                              │
                              v (生成完成)
  applyGenerationResult(fullText, subTitle, isChapterScope)
  ├─ buildPreviewReferencesFromContent → 合并检测到的引用
  ├─ findFigureBlocks(text) → 解析 FIG:{...} → generateFigure()
  │   → Python matplotlib 子进程 → 替换为 ![](url)
  └─ → workbench.handleApplyAiContent()
      ├─ ensureSubsectionNumbering → 修正标题编号
      ├─ normalizeAllCitationFormats → 统一 [N] 格式
      ├─ stripOutOfRangeCitations → 移除越界引用
      ├─ cleanDraftArtifacts → 清理 AI 占位符
      ├─ deduplicateParagraphs → 去重
      ├─ setProject → sections[sectionKey] = processedContent
      ├─ setEditingContent = processedContent
      └─ batchUpsertReferences(projectId, refMapping) → Prisma
═══════════════════════════════════════════════════════════════════════
```

### 3.3 跨模块连接矩阵

| 写作 → | 知识库/RAG | 图表/Figure | 参考文献 | 项目 Sections | 研究方向 |
|---------|-----------|------------|---------|-------------|---------|
| **数据来源** | RAG 检索 → contextText | 无（AI 自主生成 FIG block） | project.references | project.sections | project.researchDirection |
| **写入目标** | 无（只读） | 生成图表→替换文本 | 新增引用→batchUpsert | sections[sectionKey] | 无（单向） |
| **验证机制** | citation-validator.ts | 无（仅替换占位符） | normalize + strip | deduplicateParagraphs | 无 |
| **连接强度** | 🔴 强（核心依赖） | 🟡 中（AI 自主触发） | 🔴 强（核心依赖） | 🔴 强（核心依赖） | 🟢 弱（仅 context 注入） |

### 3.4 发现的数据连接问题

| # | 问题 | 文件位置 | 详情 | 严重度 |
|---|------|---------|------|--------|
| W1 | **Blueprint 过期检测不完整** | `workbench-page-client.tsx:261-269` | `blueprintStale` 只检查 `project.outline` 变化，不检查 section 内容变化。章节内容重写后蓝图指导可能已失效 | 中 |
| W2 | **AI 生成内容与 Outline Task 无持久关联** | `workbench-page-client.tsx` L377-500 | `handleApplyAiContent` 应用内容时使用 `sectionKey` 定位，但不保存对应的大纲节点 ID。outline 重构后无法追溯内容来源 | 中 |
| W3 | **Figure-Blueprint 脱节** | `use-writing-panel-generate.ts` | `WritingBlueprint.figurePlan` 规划了每章节图表，但 AI 生成 FIG:{...} 时不消费此规划。生成后的图表无 `figurePlan.id` 关联 | 中 |
| W4 | **evidenceSummary 名不副实** | `prepare-context.ts:98-105` | `buildEvidencePack({ ragChunks: [] })` — 证据摘要仅含 data claims，不含文献证据。文献证据在 contextText 中单独处理 | 低 |
| W5 | **analysisResults 双路径注入** | `prepare-context.ts:123-135` + `writing-panel.tsx` | `globalContext.analysisResults` 自动注入系统 prompt，同时用户可在 context 文本框手动粘贴分析内容，可能导致重复 | 低 |
| W6 | **lastRefMapping 跨组件漂移** | `writing-panel.tsx` ↔ `workbench-page-client.tsx` | WritingPanel 维护 `lastRefMapping`，但 workbench 的 `handleApplyAiContent` 独立重新解析引用（使用当前 `project.references.length`），并发场景下索引可能错位 | 低 |
| W7 | **会话持久化不完整** | `use-writing-panel-session.ts` | 保存 title/section/context/bullets/result，但不保存 source selection state、pending figures、lastRefMapping。切换 tab 后文献来源选择需重新获取 | 低 |
| W8 | **Preview 在 section 切换时丢失 AI 内容** | `workbench-page-client.tsx:226-254` | `previewProject` 只在 `aiPreview.targetSection === sectionKey` 时注入 AI 内容。切换 section 后预览回退到编辑器内容，但 AI 仍在流式生成中 | 低 |

---

## 四、冗余与重复功能清单

### 4.1 总览

| 严重度 | 数量 | 类型 |
|--------|------|------|
| 🔴 高 | 7 | 死代码 / 完全重复 / 应合并 |
| 🟡 中 | 7 | 功能重叠 / 并行模块 / 应重构 |
| 🟢 低 | 8 | 碎片化 / 命名问题 / 应整理 |

### 4.2 🔴 高严重度

#### H1: `src/services/chart-service.ts` — 死代码

- **引用次数**：0（整个 src/ 无任何 import）
- **内容**：导出 `generateChart()`, `imageToMarkdown()`, `imageToHtml()`
- **重叠**：`generateChart()` 调用 `POST /api/chart`，与 `services/charts.ts` 的 `postChartForm()` 功能完全重复
- **建议**：直接删除

#### H2: `src/components/shared/evidence-panel.tsx` — 死代码

- **引用次数**：0（仅自身内部引用）
- **原因**：已被 `EvidenceHubSections`（data-panel.tsx 使用）替代
- **额外问题**：与 `evidence-hub-sections.tsx` 中定义了完全相同的 `CLAIM_TYPE_LABELS` 常量（L25-32）
- **建议**：直接删除

#### H3: `src/components/shared/chart-panel.tsx` — 41 行纯透传包装器

- **功能**：将 props 原样传给 `ChartWorkspace`，仅重命名 `projectId` → `_projectId`
- **被引用**：`plot-figure-panel.tsx`
- **建议**：让 `plot-figure-panel.tsx` 直接使用 `ChartWorkspace`，删除此文件

#### H4: `chart-preview-pane.tsx` 与 `plot-preview-pane.tsx` 重复 UI

- **chart 版**：`chart/chart-preview-pane.tsx` — loading + empty + result + generate/download/insert 按钮
- **plot 版**：`plot/plot-preview-pane.tsx` — loading + empty + result + generate 按钮（更通用）
- **差异**：chart 版多了 download/insert 按钮，其余 UI 模式完全相同
- **建议**：chart 版使用 plot 版作为基础，只扩展 download/insert 按钮

#### H5: `src/types/review.ts` 与 `src/contracts/review.ts` 类型分裂

- **types/review.ts**：163 行，核心领域类型（ReviewReport, ReviewDimension, ReviewIssue 等）
- **contracts/review.ts**：90 行，re-export + DB 记录类型
- **问题**：`types/` 目录仅剩 `review.ts` 和 `consistency.ts` 两个文件；所有其他类型都在 `contracts/`
- **建议**：合并 `types/review.ts` → `contracts/review.ts`，删除 `src/types/` 目录

#### H6: `src/services/analysis.ts` 手动 SSE 循环重复 `sse-client.ts`

- **位置**：`analysis.ts:27-49` — 手动 `while(true) reader.read()` 循环
- **已有工具**：`src/lib/sse-client.ts` 的 `readSSEStream()` — 设计目的就是消除重复 SSE 读取
- **其他违规**：`services/translate.ts` 也有自己的原始 SSE 读取循环
- **建议**：两个服务都改用 `readSSEStream()`

#### H7: `POST /api/save-chart` 独立保存端点不必要

- **功能**：接收 base64 PNG → 写入 `data/charts/` → 返回 URL 路径
- **建议**：`POST /api/chart` 直接保存生成的文件并返回 URL，删除此独立端点

### 4.3 🟡 中严重度

#### M1: `chart/` 与 `plot/` 并行组件树

```
src/components/shared/chart/（4 文件）     src/components/shared/plot/（4 文件）
├─ chart-workspace.tsx                   ├─ plot-workspace.tsx
├─ chart-preview-pane.tsx                ├─ plot-preview-pane.tsx
├─ chart-field-form.tsx                  ├─ plot-figure-panel.tsx
└─ chart-type-strip.tsx                  └─ registered-charts-card.tsx
```

- **关系**：`chart/` 是旧图表实现，`plot/` 是重构后的通用抽象
- **问题**：`chart-workspace` 自己搭双栏布局而不用 `plot-workspace`；`plot-figure-panel` 引用 `ChartPanel`（旧包装器）
- **建议**：让 chart workspace 使用 plot 布局原语，逐步废弃 chart/ 目录

#### M2: 两个 Blueprint 弹窗

| 文件 | 特性 |
|------|------|
| `outline-blueprint-dialog.tsx` | 只读摘要视图，在大纲面板中使用 |
| `blueprint/blueprint-workspace-dialog.tsx` | 可编辑工作区弹窗 |

- **重叠 props**：都接收 `blueprint: WritingBlueprint | null`, `project`, `projectId`
- **建议**：合并为一个弹窗，加 `readOnly?: boolean` prop

#### M3: 改写服务命名混乱

| 文件 | 位置 | 职责 |
|------|------|------|
| `services/plagiarism-service.ts` | server | 查重检测 |
| `services/rewrite-service.ts` | server | AI 改写执行 |
| `services/plagiarism.ts` | client | 查重 + 改写 API 调用 |

- **问题**：三个文件跨越 client/server，但命名不反映分层
- **建议**：标准化命名：`plagiarism-check.ts`(server) + `plagiarism-rewrite.ts`(server) + `plagiarism-client.ts`

#### M4: 引用处理三文件碎片化

| 文件 | 内容 |
|------|------|
| `lib/citation.ts` | normalize, expand, process, click handler |
| `lib/citation-bounds.ts` | bounds checking, format normalization |
| `lib/citation-validator.ts` | citation validation, data claim validation |

- **总行数**：~300 行
- **建议**：合并为 `lib/citation.ts`，用清晰的 section 注释分块

#### M5: `quality-persist.ts` + `quality-restore.ts` 微文件

- **quality-persist.ts**：~25 行，保存审查结果到 project
- **quality-restore.ts**：~40 行，从 DB 重建 UI 报告
- **建议**：合并为 `lib/quality-state.ts`（共 65 行）

#### M6: `/api/analysis` vs `/api/data/analyze` 命名冲突

| 路由 | 实际功能 |
|------|---------|
| `POST /api/analysis` | AI SSE 趋势描述 |
| `POST /api/data/analyze` | 纯统计分析 |

- **问题**："analysis" 和 "analyze" 几乎不可区分
- **建议**：重命名 `/api/analysis` → `/api/data/trends`

#### M7: `analysis-panel.tsx` 与 `data-panel.tsx` 功能重叠

| 组件 | 使用场景 |
|------|---------|
| `analysis-panel.tsx` | 独立 `/analysis` 页面 |
| `data-panel.tsx` | 工作台"数据"tab |

- **共同逻辑**：文件上传、CSV 解析、AI 分析流、图表插入
- **建议**：提取共享 hook `use-data-analysis.ts`

### 4.4 🟢 低严重度

| # | 问题 | 建议 |
|---|------|------|
| L1 | `rewrite-service.ts` 中 `calcTextSimilarity()` 重复了 `similarity.ts` 的 jaccard 组合逻辑 | 提取到 `similarity.ts` 作为公共函数 |
| L2 | `contracts/figure.ts` 600+ 行，覆盖 4 个不同关注点 | 拆分为 `figure-spec.ts` / `figure-asset.ts` / `figure-replay.ts` |
| L3 | `mode-theme.ts` 硬编码了 `primary: "#1a5632"` 等颜色值，与 `site-theme.ts` 重复 | 全部引用 `siteTheme` 常量 |
| L4 | 7 个 review prompt 文件过于碎片化 | 合并为 `prompts/review.ts` 多个命名导出 |
| L5 | `reference-reorder.ts` + `ref-format.ts` 可合并 | 合并为 `lib/references.ts` |
| L6 | `direction/` 目录 12 个组件可合并部分 | 合并 form+list → `direction-asset-manager.tsx` |
| L7 | `server-pdf.ts`（服务端）在 `services/` 目录不恰当 | 移至 `lib/`（与其他服务端模块一致） |
| L8 | 多个弹窗重复 Dialog/DialogContent/DialogHeader/DialogTitle/DialogFooter 模板 | 提取 `BaseDialog` 包装器减少 ~10 行/弹窗 |

---

## 五、导航与返回逻辑

### 5.1 当前实现

```
NavigationHistoryProvider（全局 Context）
├─ useEffect → 每次 pathname 变化 pushNavPath(stackRef, href)
└─ goBack(fallback)
    ├─ popNavBack(stackRef) → 弹出一个
    ├─ 有 target → router.back() [已于 2026-07-05 修复，原为 router.push(target)]
    └─ 栈空 → router.push(fallback)
```

### 5.2 已修复的问题

| 问题 | 修复前 | 修复后 |
|------|--------|--------|
| 浏览器历史污染 | `router.push(target)` 每次新增一条记录 | `router.back()` 真正回退 |

### 5.3 剩余问题

| # | 问题 | 影响 |
|---|------|------|
| N1 | **刷新后栈丢失** — 内部栈在 `useRef` 中，刷新后只剩当前页一条 | 点返回走 fallback，到不了来时的页面 |
| N2 | **router.back() 在外部跳转后不可靠** — 如果用户从外部链接进入，router.back() 可能离开应用 | 需要检测 history.length 或使用其他策略 |

---

## 六、图表/作图板块

### 6.1 当前架构（2026-07-05 已部分重构）

```
registry.json (19 种图形)
├─ global_style_fields: 15 个字段
│   ├─ display: "visible" → 3 个（preset/dpi/export_formats）
│   ├─ display: "advanced" → 12 个（折叠隐藏）
│   └─ 已移除 show_values/bar_edge → 移到柱状图 config_fields
└─ figures: 19 条记录

前端: chart-workspace.tsx (2 tab: 数据/样式)
Python: plot_generic.py → chart_base.py → chart_types/*.py
```

### 6.2 已修复的 Bug（2026-07-05）

| 文件 | 问题 | 修复 |
|------|------|------|
| `chart_types/line.py` | `x_tick_rotation` 被硬编码 `rotation=20` 覆盖 | 移除硬编码 |
| `chart_types/area.py` | 同上 | 移除硬编码 |
| `chart_types/heatmap.py` | 硬编码 `rotation=30` + 不走 `finalize_axes` | 统一走 `finalize_axes` |
| `chart_types/pie.py` | 不调 `finalize_axes`，panel_label/grid/legend 无效 | 添加 `finalize_axes()` |
| `chart_types/radar.py` | 同上 + 缺少 `apply_axis_extras` | 添加 axis extras |
| `chart_types/forest.py` | 缺少 legend 支持 | 添加 `apply_legend()` |
| `chart_base.py` | `apply_axis_extras` config 优先于 style | 改为 style 优先 |

### 6.3 剩余问题

| # | 问题 | 详情 |
|---|------|------|
| C1 | `chart-service.ts` 死代码（见 H1） | 待删除 |
| C2 | `chart/` vs `plot/` 并行组件树（见 M1） | 待统一 |
| C3 | `save-chart` API 不必要（见 H7） | 待合并 |
| C4 | 热度图 `finalize_axes` 会错误设置 `ax.set_ylabel(y_label)` — heatmap 的 y_label 是色标标签 | 需要特殊处理 |

---

## 七、架构与代码质量问题

### 7.1 大文件清单（>500 行）

| 文件 | 行数 | 风险 |
|------|------|------|
| `workbench-page-client.tsx` | 2479 | 🔴 过大，需要拆分为多个子组件/hooks |
| `writing-panel.tsx` | 710 | 🟡 已有部分 hooks 拆分，可继续 |
| `contracts/figure.ts` | 626 | 🟡 覆盖 4 个关注点 |
| `lib/reference-reorder.ts` | 270+ | 🟢 可合并到 references 模块 |
| `lib/prompts/writing.ts` | ~500 | 🟢 功能集中，可接受 |

### 7.2 类型系统问题

| 问题 | 详情 |
|------|------|
| `types/` vs `contracts/` 分裂 | 仅 review.ts 留在 types/，其余在 contracts/ |
| `direction.ts` 类型 ~300 行 | 方向/资产/分析/路线图全在一个文件 |
| `figure.ts` 类型 600+ 行 | 覆盖 4 种不同关注点 |
| `WritingBlueprint` vs 路线图 `RoadmapPaper` | 两套独立类型描述相似概念 |

### 7.3 数据库 Schema 问题

| 问题 | 详情 |
|------|------|
| Direction.assets JSONB | 无独立 Asset 表，无外键，无索引 |
| Direction.analysis JSONB | 分析结果不可结构化查询 |
| Direction.roadmap JSONB | 同上 |
| Project JSON 字段过多 | charts, dataClaims, dataSources, analysisResults, references 全为 JSON/JSONB |

### 7.4 测试覆盖

| 测试文件 | 数量 |
|----------|------|
| `__tests__/contracts/` | chart-prefill.test.ts |
| `__tests__/services/` | project-charts-patch.test.ts |
| `__tests__/hooks/` | figure-pipeline.test.ts |
| `__tests__/components/` | writing-figure-edit-links.test.ts |

⚠️ 测试覆盖较薄，核心管道（writing pipeline）、资产清点（direction assets patch）、RAG 检索等重要模块缺少测试。

---

## 八、建议优先级排序

### P0（立即处理，<1 小时）

| # | 任务 | 对应问题 | 预计耗时 |
|---|------|---------|---------|
| 1 | 删除 `chart-service.ts` | H1 | 1 min |
| 2 | 删除 `evidence-panel.tsx` | H2 | 1 min |
| 3 | 合并 `types/review.ts` → `contracts/review.ts`，删 `src/types/` | H5 | 15 min |
| 4 | 删除 `chart-panel.tsx` 透传包装器，直接使用 `ChartWorkspace` | H3 | 10 min |

### P1（本周处理，2-4 小时）

| # | 任务 | 对应问题 | 预计耗时 |
|---|------|---------|---------|
| 5 | 统一 chart/plot 组件树：chart workspace 用 plot 布局原语 | M1 | 1h |
| 6 | 合并两个 Blueprint 弹窗 | M2 | 30 min |
| 7 | 合并 `citation.ts` + `citation-bounds.ts` + `citation-validator.ts` | M4 | 30 min |
| 8 | `analysis.ts` 和 `translate.ts` 改用 `readSSEStream()` | H6 | 30 min |
| 9 | 合并 `quality-persist.ts` + `quality-restore.ts` | M5 | 10 min |
| 10 | 合并 `POST /api/save-chart` 到 `POST /api/chart` | H7 | 30 min |
| 11 | 重命名 `/api/analysis` → `/api/data/trends` | M6 | 15 min |

### P2（本月处理，1-2 天）

| # | 任务 | 对应问题 | 预计耗时 |
|---|------|---------|---------|
| 12 | 提取 `use-data-analysis.ts` 共享 hook（analysis-panel + data-panel） | M7 | 2h |
| 13 | 拆分 `contracts/figure.ts`（600 行 → 3 文件） | L2 | 1h |
| 14 | 合并 7 个 review prompt 文件 → `prompts/review.ts` | L4 | 1h |
| 15 | 合并 `direction/` 部分组件（form+list / 小弹窗） | L6 | 2h |
| 16 | 修复 Blueprint 过期检测（增加 section 内容变化检查） | W1 | 1h |
| 17 | AI 生成段落→大纲节点关联存储 | W2 | 2h |
| 18 | Figure-Blueprint 对接：生成图表时消费 FigurePlan | W3 | 3h |

### P3（长期，按需）

| # | 任务 | 对应问题 | 预计耗时 |
|---|------|---------|---------|
| 19 | Direction.assets 独立 Asset 表 | A1 | 4h |
| 20 | 统一 WritingBlueprint 和 RoadmapPaper 类型 | A2 | 3h |
| 21 | Direction↔Project 双向状态同步 | A3 | 3h |
| 22 | 增加核心管道测试覆盖 | — | 1d |
| 23 | workbench-page-client.tsx 拆分（2479 行 → <1000） | — | 1d |
| 24 | 服务器端 `server-pdf.ts` 移至 `lib/` | L7 | 10 min |

---

## 附录：完整文件引用关系

### A. 服务层 (36 个文件)

| 文件 | 类型 | 调用 API |
|------|------|---------|
| `admin-usage.ts` | server | Prisma aiUsageLog |
| `analysis.ts` | client | POST /api/analysis（含手动 SSE 循环 ⚠️） |
| `auth.ts` | server | Prisma User |
| `chart-service.ts` | client | POST /api/chart（⚠️ 死代码，零引用） |
| `charts.ts` | client | POST /api/chart |
| `consistency.ts` | client | POST /api/consistency, /api/consistency/fix |
| `data-analysis.ts` | client | POST /api/data/analyze |
| `direction.ts` | client | GET/POST/PATCH /api/directions/* |
| `direction-checks.ts` | server | Prisma Direction + KnowledgeFile |
| `evidence-pack.ts` | server | 无外部调用（纯计算） |
| `figures.ts` | client | GET /api/figures/registry, POST /api/chart |
| `knowledge.ts` | client | GET/POST/PATCH/DELETE /api/knowledge |
| `literature.ts` | client | POST /api/literature/search |
| `monitoring.ts` | server | 无外部调用 |
| `outline.ts` | client | POST /api/outline, POST /api/outline/blueprint |
| `pdf-export.ts` | client | POST /api/export/pdf |
| `plagiarism.ts` | client | POST /api/plagiarism/check, /rewrite, /history, /v2 |
| `plagiarism-service.ts` | server | Prisma PlagiarismCheck + 外部 API |
| `project-charts.ts` | client | PATCH /api/projects/[id]/charts |
| `project.ts` | client | GET/POST/PATCH/DELETE /api/projects/* |
| `project-server.ts` | server | Prisma Project |
| `reference-server.ts` | server | Prisma Reference |
| `references.ts` | client | GET/POST /api/references |
| `review.ts` | client | POST /api/review |
| `review-service.ts` | server | Prisma Review |
| `rewrite-service.ts` | server | AI + similarity ⚠️（calcTextSimilarity 重复） |
| `save-chart.ts` | client | POST /api/save-chart |
| `section-structure.ts` | client | 纯计算（读取 project.mode） |
| `server-pdf.ts` | server | Playwright PDF ⚠️（应在 lib/） |
| `translate.ts` | client | POST /api/translate（含手动 SSE 循环 ⚠️） |
| `usage.ts` | client | GET /api/admin/usage |
| `writing-context.ts` | server | RAG + Prisma KnowledgeFile |
| `writing-retrieve-preview.ts` | client | POST /api/writing/retrieve-preview |
| `writing.ts` | client | POST /api/writing |
| `xrd-features.ts` | client | POST /api/xrd/* |
| `xrd-lab.ts` | client | POST /api/xrd/* |

### B. Hooks 层（~40 个文件）

| Hook | 用途 | 使用者 |
|------|------|--------|
| `use-auto-save` | IndexedDB 自动保存（10s interval） | workbench |
| `use-chart-panel` | 图表面板状态管理（数据/样式/生成） | chart-workspace |
| `use-consistency` | 一致性检查、标记、AI 修复 | consistency-dialog |
| `use-docx-export` | DOCX 导出 | workbench |
| `use-figure-pipeline` | FIG:{...} 块解析与图表批量生成 | writing-panel |
| `use-ai-paragraph` | 单段落 AI 扩写 | paragraph-editor |
| `use-writing-stream` | SSE 流消费者 | writing-panel |
| `use-writing-panel-generate` | 写作请求构建 + 生成编排 | writing-panel |
| `use-writing-source-selection` | RAG 检索预览 + 来源选择 | writing-panel |
| `use-writing-panel-preview-sync` | 节流预览推送 | writing-panel |
| `use-writing-panel-session` | localStorage 会话持久化 | writing-panel |
| `use-writing-bullet-expand` | 逐要点协作扩写 | writing-panel |
| `use-direction-analysis` | 10维分析 SSE 流状态 | direction-analysis-panel |
| `use-go-back` | 导航返回 | NavigationHistoryProvider |

---

> 报告结束。共审计 78 个 API 路由、36 个 service、~40 个 hook、~120 个组件、19 种图形类型。
> 发现高严重度问题 7 项、中严重度 7 项、低严重度 8 项。
> 建议立即处理 4 项（<1h），本周处理 7 项（2-4h），本月处理 7 项（1-2d）。
