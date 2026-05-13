# Changelog

## [Unreleased]

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
