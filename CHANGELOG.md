# Changelog

## [Unreleased]

### 质量中心（2026-06-15 ~ 2026-06-17）
- **统一质量工作台** `QualityWorkspace`：查重 / 降重 / 审查三 Tab 合一（`src/components/shared/quality/quality-workspace.tsx`）
- **审查内联**：审查结果嵌入质量中心，`review-tab.tsx` 支持四维度展开与单项修复
- **写回改写**：降重采纳后自动写回工作台章节内容
- **匹配预览**：查重匹配片段高亮对照（`match-content-preview.tsx`）
- **检查进度**：SSE 分阶段进度条（自引→跨项目→知识库→语义→联网）
- **会话持久化**：查重/审查状态刷新不丢失（`quality-persist.ts` + `quality-restore.ts`）
- 审查侧栏按维度/严重度筛选（`section-sidebar.tsx`）
- 新增测试：`quality-restore.test.ts`、`quality-sections.test.ts`

### 写作蓝图（2026-06-14 ~ 2026-06-17）
- **写作蓝图系统**：扩写前的全局叙事与配图规划（`contracts/writing-blueprint.ts`）
- **蓝图工作台**：大纲节点选择 + 段落规划 + 配图分配（`blueprint/blueprint-workspace.tsx`）
- **蓝图编辑器 Hook**：`use-blueprint-editor.ts`，支持节点增删改
- **蓝图恢复**：工作区刷新/切换项目后自动恢复蓝图状态（`blueprint-utils.ts`）
- **蓝图 DB**：读写 `Project.writingBlueprint` JSON 列（`project-writing-blueprint-db.ts`）
- 创建项目时可选写作语言（zh/en）→ `Project.language`
- 新增测试：`blueprint-utils.test.ts`、`project-writing-blueprint-db.test.ts`

### 查重 v2 统一（2026-06-13 ~ 2026-06-15）
- **v2 SSE 统一**：查重结果与进度通过统一 SSE 通道推送
- **认证范围修正**：修复跨项目查重的权限过滤
- **共享 UI 抽取**：`plagiarism/check-form.tsx`、`result-view.tsx`、`rewrite-view.tsx` 独立组件
- **查重工具库**：`plagiarism-utils.ts` + `plagiarism-access.ts` 权限/格式化
- 修复 toast 通知和 tab 跳转重复触发 bug
- 新增测试：`plagiarism-utils.test.ts`

### 写作增强（2026-06-10 ~ 2026-06-14）
- **证据中心**：数据证据声明管理（`evidence-hub-sections.tsx`）
- **数据源选择器**：`data-panel.tsx` 增强，支持数据声明绑定
- **要点扩展**：大纲节点一键扩写为完整段落
- **配图编辑链接**：`writing-figure-edit-links.tsx` 写作面板内联配图管理
- 新增测试：`writing-figure-edit-links.test.ts`

### 工作台重构（2026-06-08 ~ 2026-06-12）
- workbench 页面懒加载（`lazy-load pages`），减少首屏 bundle
- 提取 `workbench-tab-switcher.tsx`、`workbench-meta-dialog.tsx` 独立组件
- 图表工作台 `chart-workspace.tsx` 重构，拆分 `registered-charts-card.tsx`
- 大纲面板 `outline-panel.tsx` + `outline-blueprint-dialog.tsx` 交互优化
- 新增测试：`chart-prefill.test.ts`、`project-charts-patch.test.ts`

### 基础设施（2026-06-01 ~ 2026-06-07）
- Prisma schema 新增 `Project.language`、`Project.writingBlueprint` 字段
- instrumentation.ts 服务启动检查
- 部署脚本完善（`scripts/deploy/package.ps1`、`preflight.sh`）
- 中间件认证覆盖扩展

### 工程稳定性（2026-05-11）
- 添加 Vitest 测试框架（17 个测试）
- 统一 API 响应格式（`src/lib/api-response.ts`）
- 添加 Zod 输入校验（`src/lib/validations.ts`，覆盖 9 个 API）
- 扩展中间件认证覆盖（12+ 个 API 端点补保护）
- 添加 AI 端点限流（10 次/60s）
- 拆分 workbench/page.tsx（1206 行 → 822 行）
  - 提取 `useDocxExport` hook（340 行 DOCX 导出逻辑）
  - 提取 `useReferenceReorder` hook（65 行引用重排逻辑）
- 消除 cosineSimilarity 重复代码
- 架构文档 `docs/ARCHITECTURE.md`
- 周报模板 `docs/WORK_LOG_TEMPLATE.md`

### 功能（2026-03 ~ 2026-05）
- 多 Agent 写作管道（Writer → Verifier → Refiner）
- 私有知识库 RAG（167 篇 PDF，BM25+向量+RRF 混合检索）
- 引用真实性逐条验证
- 4 策略 AI 降重（同义替换/改语序/概括/扩写）
- 查重系统（自身重复/跨项目/知识库/联网/AI 语义）
- DOCX 多模板导出（SCI/GB/T 7713/IEEE/Nature）
- 论文项目管理（多项目、章节编辑、自动保存）
- 专业图表生成（XRD 分析、流程图、分子结构、实验数据图）
- PDF 文献阅读器（Annotations、分类管理、全文检索）
- JWT 认证系统（注册/登录/多用户）
