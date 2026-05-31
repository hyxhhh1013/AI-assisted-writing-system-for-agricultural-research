# 论文助手工程改进计划

> 参考对象：onion 项目的工程纪律
> 当前状态：已有较好的基础（AGENTS.md / ARCHITECTURE.md / CONVENTIONS.md / CLAUDE.md 技术债追踪）
> 改进目标：补上"可维护性基础设施"的最后几块拼图

---

## 1. DATABASE.md — 数据库文档

### 现状
- Prisma schema 有 10 个模型，关系写在 schema 里
- ARCHITECTURE.md 有 ERD 图但缺少字段级说明
- 没有一份独立文档能让你 30 秒查到"这个字段是什么意思"

### 改进
在 `docs/DATABASE.md` 新建，覆盖：

```
1. 核心表关系总览图（已有 ERD，迁移过来即可）
2. 每张表的关键字段说明（各 2-3 行，不写完整 schema）
3. 索引策略（已有的 + 待补的 3 条）
4. 常见查询路径（"查某用户的所有项目"、"查某项目的所有引用"）
```

### 成本：30 分钟

---

## 2. 业务流程文档 — 核心 Pipeline 显式化

### 现状
- 写作 Pipeline（Writer→Verifier→Refiner）写在 AGENTS.md 的架构图里
- 但每个环节的输入/输出/异常分支在代码里，没有文档

### 改进
在 `docs/WORKFLOWS.md` 新建，只写 3 个最核心的流程：

```
流程 1：用户写作流程
  输入 → 大纲构建 → AI 分段写作 → 一致性检查 → 引用验证 → 导出
  每个步骤标：涉及的 API 端点、调用的 service、可能的异常

流程 2：RAG 检索流程
  文档上传 → PDF 解析 → Chunk 分割 → 向量化 → 混合检索（BM25+向量 RRF）
  每个步骤标：关键参数（chunk_size, top_k）、性能数据

流程 3：图表生成流程
  【FIGURE:{...}】标记 → Python 子进程 → matplotlib → 图片 URL → Markdown 替换
  每个步骤标：涉及的环境变量、超时处理、错误回退
```

### 成本：1 小时

---

## 3. 代码领域地图 — 功能→文件映射

### 现状
- AGENTS.md 列了"关键文件修改前必读"列表
- 但没有系统性的"找什么功能改什么文件"的映射

### 改进
在 `docs/CODE_MAP.md` 新建，结构仿 onion 的 `领域代码索引.md`：

```
## 项目管理
- 页面: src/app/projects/page.tsx, src/app/workbench/page.tsx
- API: src/app/api/projects/route.ts, src/app/api/projects/[id]/*
- Service: src/services/project.ts
- Hook: src/hooks/use-project-loader.ts
- 类型: src/contracts/project.ts

## AI 写作
- 页面: src/app/writing/page.tsx
- API: src/app/api/writing/route.ts (436行, 主管道)
- 组件: src/components/shared/writing-panel.tsx (826行, 最大)
- Hook: src/hooks/use-writing-stream.ts (207行)
- Prompt: src/lib/prompts/writing.ts
- 类型: src/contracts/writing.ts, src/contracts/sse.ts

## 查重
- 页面: src/app/plagiarism/page.tsx
- API: src/app/api/plagiarism/* (5 个端点)
- Service: src/services/plagiarism-check.ts, src/services/rewrite-service.ts
- 数据库: PlagiarismCheck, PlagiarismMatch, RewriteSuggestion

## 知识库/RAG
- 页面: src/app/knowledge/page.tsx
- Core: src/lib/rag.ts (433行, 检索引擎)
- API: src/app/api/knowledge/*, src/app/api/chat/route.ts
- 索引脚本: scripts/index-pdfs.mjs
- 数据: data/ (8 个分类索引 + metadata.json)

## 图表生成
- 页面: src/app/plot/page.tsx
- API: src/app/api/chart/route.ts, src/app/api/figures/registry/route.ts
- Python: scripts/charts/ (15 种图形 + 注册表)
- 组件: src/components/shared/chart-panel.tsx
- Hook: src/hooks/use-figure-pipeline.ts (309行)

## 认证
- 页面: src/app/login/page.tsx, src/app/register/page.tsx
- API: src/app/api/auth/*
- Lib: src/lib/auth.ts, src/lib/auth-context.tsx
- 中间件: src/proxy.ts (含 BYPASS_AUTH)
- 数据库: User

## 导出
- DOCX: src/services/server-pdf.ts, src/hooks/use-docx-export.ts
- PDF: src/app/api/export/pdf/route.ts, src/hooks/use-pdf-export.ts
- Markdown: src/hooks/use-markdown-export.ts
```

每行不超 3 个关键文件，一眼知道改哪里。

### 成本：30 分钟

---

## 4. 脚本目录整理

### 现状
- 根目录脚本已迁移到 `_shared/scripts/`（wiki 侧）
- 论文助手自己的脚本在 `scripts/` 下，结构合理（charts/, eval/, misc/）
- 但 root 仍有 `empty.js`（Turbopack stub）和一些演示用的 .md 文件散落

### 改进
1. 根目录中文 .md 演示文件（`汇报材料-*.md`、`项目演示介绍稿.md`）→ 移入 `docs/` 或 `exports/`
2. `empty.js` 保留（Turbopack 必须），但加一行注释说明用途
3. `scripts/` 下已有分类，保持不动。如有一次性实验脚本 → 加 `scripts/misc/` 归档

### 成本：10 分钟

---

## 5. 测试覆盖

### 现状
- 6 个测试文件、45 个测试
- 覆盖集中在 API 响应格式和 RAG 参数化
- 核心业务逻辑（utils.ts 257 行、citation-validator.ts、content-pipeline.ts）没有单测

### 改进（优先级从 CLAUDE.md 技术债 P3-2）
优先给以下 3 个纯函数模块补单测（纯逻辑、无副作用、最容易测）：

| 模块 | 现有测试 | 建议补 | 原因 |
|------|---------|--------|------|
| `src/lib/utils.ts` | 0 | parseOutline, buildExpansionContext, deduplicateParagraphs | 核心逻辑，改了就影响整条管道 |
| `src/lib/citation-validator.ts` | 0 | 引用验证的边界 case | 正则匹配易出 bug |
| `src/lib/content-pipeline.ts` | 0 | LaTeX 规范化、Markdown 块解析 | 管道入口，错一处全错 |

### 成本：每个 30 分钟，共 1.5 小时

---

## 6. README.md — 项目门面

### 现状
- 没有 README.md
- 信息分散在 AGENTS.md / CLAUDE.md / docs/ 各处

### 改进
新建 `README.md`，200 字以内，包含：
- 项目简介（一句话）
- 技术栈（5 个关键词）
- 快速启动（3 条命令）
- 文档导航（指向 docs/ 下各文件）

### 成本：15 分钟

---

## 执行优先级

| 优先级 | 事项 | 成本 | 状态 |
|--------|------|------|------|
| **今天** | README.md | 15 分钟 | ✅ 完成 |
| **今天** | CODE_MAP.md | 30 分钟 | ✅ 完成 |
| **本周** | DATABASE.md | 30 分钟 | ✅ 完成 |
| **本周** | WORKFLOWS.md | 1 小时 | ✅ 完成 |
| **本周** | 脚本整理 | 10 分钟 | ✅ 完成 |
| **下周** | 补 3 个核心单测 | 1.5 小时 | ⏳ 待做 |

**已完成 5/6，剩余 1.5 小时。**

---

## 与 CLAUDE.md 现有技术债的关系

本计划不替代 CLAUDE.md 中的 14 项技术债。两者的分工：

- **技术债**（CLAUDE.md）：代码层面的问题（any 类型、fetch 迁移、zod schema、Prisma 索引……）
- **本计划**：文档和工程纪律层面的问题（DATABASE.md、WORKFLOWS.md、CODE_MAP.md……）

两条线并行推进，互不阻塞。技术债逐个修，文档一次性补齐。
