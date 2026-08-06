# Changelog

## [Unreleased]

### Wave 3 学术对齐（2026-07-14 ~ 2026-08-06）

**Agent 写作助手（学术论文对齐）**
- 完整 Agent 工作台：inspect/read 多上下文、自动生成大纲/写作蓝图、自主门禁、Plan 子任务驱动执行环、同一会话跟聊、会话工作记忆
- 行为主轴打磨：剧本验收、先读后写硬门禁、无进展熔断、检索/读窗口配额
- 写节全链路：自反思循环、结构化观察、自动核查修正（Verifier/Refiner）、引用语义接地、分节完整度、机制图/多面板复合图、真实 token 流式、上下文压缩
- 澄清与确认：`ask_user` 结构化意图确认、S2 铁律检查点（大纲批准/配置确认）、写操作确认卡（文献导入等）
- 附件支持（W3-FILE-UPLOAD）：AgentAttachment 模型 + 上传/删除/pin 到项目；pdf/csv/xlsx/txt/docx 文本提取；GLM-4V 图片/PDF 图表视觉理解；异步提取 + 对话框上传 UI
- 编排优化（P0）：项目快照单飞缓存、system prompt 前缀稳定（命中模型前缀缓存）、只读工具批次并行、会话级并发互斥（防图双跑）
- 进度透传（P1）：`write_section` 阶段 + 实时字数 SSE（`agent/progress`），写节 1-3 分钟不再静默

**审查 / 门禁 / 导出**
- 审查 max-2 轮编排 + Critical 导出门禁 + 数据免责标注
- 导出前引用硬检（`/api/citations/gate`，PDF 422 拦截）+ 双语摘要（Phase 5b）
- Passport Phase 3-7 对齐 academic-paper；Argument Blueprint 注入扩写上下文

**文献 / 知识库**
- reference evidence 元数据 + OA PDF 摄取 + Agent 文献导入可靠性

**Admin 监控**
- Dashboard agent/direction 活动面板、会话深析 + 转写回放、用量洞察（top goals/工具/失败模式）、模型配置 + 每 key 并发监控

**工程 / 部署**
- GitHub Actions 部署 workflow（云端构建 + scp + VPS apply）
- `.gitattributes` 强制 `.sh` LF（避免 CRLF 带上 VPS）；vitest forks 池规避 worker 崩溃
- 文档同步铁律 + pre-commit 告警钩子（`src/` 有改动而 `docs/` 未改时提醒）

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
