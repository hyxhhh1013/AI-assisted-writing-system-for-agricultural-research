<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 禾书耕文 (GrainScript) — AI 开发协作规范

## 项目概述

农业科研 AI 辅助写作平台。用户为实验室大二学生，单人维护，不会读代码，完全通过 Claude Code 交互开发。

## 真实技术栈（勿用训练数据猜测）

| 层 | 技术 |
|----|------|
| 框架 | Next.js 16 (App Router, Turbopack) |
| 样式 | Tailwind CSS v4 + Shadcn UI |
| 编辑器 | TipTap (段落模式) / Textarea (经典模式) |
| 数据库 | Prisma + PostgreSQL (`docker-compose.yml` 提供本地 `db` 服务) |
| 认证 | JWT (jose + bcryptjs), HTTP-only cookie |
| AI | DeepSeek API (主), Zhipu GLM-4-plus (审查代理) |
| RAG | 自研 BM25 + 向量余弦混合检索, RRF 融合 |
| PDF | Playwright (服务端导出), PDF.js (阅读器) |
| 图表 | Python (matplotlib) 子进程调用 |

## 核心架构约定

### 目录职责
- `src/services/` — API 调用封装（纯函数，不操作 DOM）
- `src/lib/` — 纯逻辑工具（prompts.ts, rag.ts, utils.ts, ai.ts, store.ts...）
- `src/components/ui/` — Shadcn 原装组件
- `src/components/shared/` — 业务组件（writing-panel, outline-panel, sci-preview...）
- `src/app/api/` — Next.js Route Handlers
- `src/app/` — 页面入口
- `scripts/charts/` — Python 图表生成脚本
- `data/` — RAG 索引文件
- `prisma/` — 数据库 schema + 迁移

### 关键文件（改动前必读）
- `src/lib/prompts.ts` — 所有 AI prompt 的统一出口（re-export from `src/lib/prompts/`）
- `src/lib/rag.ts` — RAG 检索引擎（BM25 + 向量 RRF 混合）
- `src/lib/utils.ts` — parseOutline, buildExpansionContext, buildOutlineTasks 等核心工具
- `src/app/workbench/page.tsx` — 核心工作台（当前 776 行，待继续拆分）
- `src/components/shared/writing-panel.tsx` — AI 扩写面板（当前 826 行，待拆分）
- `src/proxy.ts` — Next.js 16 Proxy 入口（原 middleware.ts，含认证/限流逻辑）

### AI 写作管道
```
Writer (DeepSeek) → Verifier (Zhipu) → Refiner (DeepSeek)
        ↓                    ↓                    ↓
   SSE 流式输出          逐条核实引用         根据意见修正
```

### FIGURE 配图管道
```
AI 输出 【FIGURE:{...}】 → findFigureBlocks 解析 → API 调用 → Python 渲染 → 替换为 ![](url)
```

### 分类 RAG 索引
- 主索引：`data/index.json`
- 分类索引：`data/index_{category}.json`
- 元数据：`data/metadata.json`
- 懒加载：`ensureCategoryLoaded()` 按需加载，`getFullText()` 遍历所有分类

## 开发铁律

1. **改前扫描**：修改任何功能前，先 grep 相关引用，确认影响范围
2. **改后验证**：`tsc --noEmit` 必须通过，然后追踪完整数据流
3. **不要重复**：新功能前先搜索项目是否已有类似实现
4. **类型严格**：禁止 `any`，所有接口必须有显式类型
5. **流式优先**：AI 生成接口必须支持 SSE streaming
6. **大文件不新增代码**：workbench/page.tsx（776行）、writing-panel.tsx（826行）、api/writing/route.ts（436行）待拆分，新逻辑优先放到独立组件/服务
7. **认证头安全**：Proxy 注入 `x-user-id` 必须用 `NextResponse.next({ request: { headers } })` 传给 Route Handler；不要用 `response.headers.set(...)`，那是发给浏览器的响应头。
