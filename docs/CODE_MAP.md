# 代码领域地图

> 功能 → 文件映射。加功能、改逻辑、查 bug 时从这里找入口。
> 每个域不超过 4 个关键文件。完整结构见 [ARCHITECTURE](ARCHITECTURE.md)。

## 项目管理

- **页面**: `src/app/projects/page.tsx` · `src/app/workbench/page.tsx` (776行)
- **API**: `src/app/api/projects/route.ts` · `src/app/api/projects/[id]/*`
- **Service**: `src/services/project.ts`
- **Hook**: `src/hooks/use-project-loader.ts` · `src/hooks/use-auto-save.ts`
- **类型**: `src/contracts/project.ts`

## AI 写作

- **页面**: `src/app/writing/page.tsx` · `src/app/outline/page.tsx`
- **API**: `src/app/api/writing/route.ts` (436行) · `src/app/api/outline/route.ts`
- **组件**: `src/components/shared/writing-panel.tsx` (826行) · `src/components/shared/pipeline-timeline.tsx`
- **Hook**: `src/hooks/use-writing-stream.ts` (207行) · `src/hooks/use-ai-paragraph.ts`
- **Prompt**: `src/lib/prompts/writing.ts`
- **类型**: `src/contracts/writing.ts` · `src/contracts/sse.ts`

## 一致性检查

- **API**: `src/app/api/consistency/route.ts` · `src/app/api/consistency/fix/route.ts`
- **Hook**: `src/hooks/use-consistency.ts`
- **组件**: `src/components/shared/workbench-consistency-dialog.tsx`
- **类型**: `src/contracts/consistency.ts`

## 查重与降重

- **页面**: `src/app/plagiarism/page.tsx`
- **API**: `src/app/api/plagiarism/*` (5 个端点)
- **Service**: `src/services/plagiarism-check.ts` · `src/services/rewrite-service.ts`
- **数据库**: `PlagiarismCheck` · `PlagiarismMatch` · `RewriteSuggestion`

## 知识库 / RAG

- **页面**: `src/app/knowledge/page.tsx`
- **核心**: `src/lib/rag.ts` (433行，BM25+向量 RRF 混合检索)
- **API**: `src/app/api/knowledge/*` · `src/app/api/chat/route.ts`
- **索引脚本**: `scripts/index-pdfs.mjs`
- **数据**: `data/` (8 个分类索引 + metadata.json)

## 图表生成

- **页面**: `src/app/plot/page.tsx`
- **API**: `src/app/api/chart/route.ts` · `src/app/api/figures/registry/route.ts`
- **Python**: `scripts/charts/` (15 种图形 + 注册表 registry.json)
- **组件**: `src/components/shared/chart-panel.tsx`
- **Hook**: `src/hooks/use-figure-pipeline.ts` (309行)
- **类型**: `src/contracts/figure.ts`

## 文献与引用

- **API**: `src/app/api/references/route.ts`
- **Hook**: `src/hooks/use-reference-reorder.ts`
- **Lib**: `src/lib/citation.ts` · `src/lib/citation-validator.ts` · `src/lib/reference-reorder.ts` (246行)
- **组件**: `src/components/shared/reference-browser.tsx`

## PDF 处理

- **页面**: `src/app/reader/page.tsx`
- **API**: `src/app/api/pdf/route.ts`
- **组件**: `src/components/pdf-viewer.tsx` · `src/components/shared/reader-panel.tsx`
- **Lib**: `src/services/server-pdf.ts`

## 导出

- **DOCX**: `src/services/server-pdf.ts` · `src/hooks/use-docx-export.ts`
- **PDF**: `src/app/api/export/pdf/route.ts` · `src/hooks/use-pdf-export.ts`
- **Markdown**: `src/hooks/use-markdown-export.ts`
- **Lib**: `src/lib/export-content.ts`

## 数据分析

- **页面**: `src/app/analysis/page.tsx`
- **API**: `src/app/api/analysis/route.ts` · `src/app/api/data/analyze/route.ts`
- **Service**: `src/services/data-analysis.ts` · `src/services/evidence-pack.ts`
- **类型**: `src/contracts/data-source.ts`

## XRD 实验室

- **页面**: `src/app/xrd-lab/page.tsx`
- **API**: `src/app/api/xrd/*` (6 个端点)
- **Python**: `scripts/charts/xrd_*.py` (6 个脚本)
- **组件**: `src/components/shared/xrd-panel.tsx` · `src/components/shared/xrd/` (9 个子组件)

## 认证

- **页面**: `src/app/login/page.tsx` · `src/app/register/page.tsx`
- **API**: `src/app/api/auth/*` (4 个端点)
- **Lib**: `src/lib/auth.ts` · `src/lib/auth-context.tsx`
- **中间件**: `src/proxy.ts` (含 `AUTH_BYPASS`)
- **数据库**: `User`

## 共享基础设施

- **AI 调用**: `src/lib/ai.ts` · `src/lib/models.ts`
- **Prompt 管理**: `src/lib/prompts.ts` · `src/lib/prompts/` (7 个子模块)
- **内容管道**: `src/lib/content-pipeline.ts` · `src/lib/markdown-parser.ts` · `src/lib/math-delimiter.ts`
- **工具函数**: `src/lib/utils.ts` (257行) · `src/lib/academic-numbering.ts`
- **API 工具**: `src/lib/api-response.ts` · `src/lib/api-validate.ts` · `src/lib/sse-client.ts`
- **功能开关**: `src/lib/feature-flags.ts` (14 个开关)
- **前端状态**: `src/lib/store.ts` · `src/lib/annotations-store.ts`
- **Prisma**: `src/lib/prisma.ts`
