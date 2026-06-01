<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 禾书耕文 (GrainScript) — AI 开发协作规范

> 最后更新：2026-06-01

## 项目概述

农业科研 AI 辅助写作平台。用户为实验室大二学生，单人维护，不会读代码，完全通过 Claude Code 交互开发。

## 真实技术栈（勿用训练数据猜测）

| 层 | 技术 |
|----|------|
| 框架 | Next.js 16 (App Router, Turbopack) |
| 样式 | Tailwind CSS v4 + Shadcn UI |
| 编辑器 | TipTap (段落模式) / Textarea (经典模式) |
| 数据库 | Prisma + PostgreSQL (`docker-compose.yml`) |
| 认证 | JWT (jose + bcryptjs), HTTP-only cookie |
| AI | DeepSeek API (主), Zhipu GLM-4-plus (审查代理) |
| RAG | 自研 BM25 + 向量余弦混合检索, RRF 融合 |
| PDF | Playwright (服务端导出), PDF.js (阅读器) |
| 图表 | Python (matplotlib) 子进程调用 |
| 字体 | 系统字体栈（`system-ui` + 中文字体），不使用 Google Fonts |

## 核心架构约定

### 目录职责
- `src/services/` — API 调用封装 [纯函数]
- `src/lib/` — 纯逻辑工具（prompts, rag, ai, settings, models, prisma...）
- `src/contracts/` — TypeScript 类型契约（admin, review, plagiarism, knowledge...）
- `src/hooks/` — React hooks（use-review, use-plagiarism-check, use-auto-save...）
- `src/components/ui/` — Shadcn 原装组件
- `src/components/shared/` — 业务组件
- `src/components/shared/review/` — 审查中心组件（review-history-list, review-workspace）
- `src/components/layout/` — 布局组件（site-shell, lab-background, site-footer）
- `src/components/home/` — 首页组件
- `src/app/api/` — Next.js Route Handlers
- `src/app/api/admin/` — Admin API（需 role=admin）
- `src/app/admin/` — Admin 后台页面
- `scripts/` — 索引脚本 (index-pdfs.mjs) + 迁移脚本 + Python 图表
- `data/` — RAG 索引文件 + metadata.json
- `prisma/` — 数据库 schema

### 关键文件（改动前必读）
| 文件 | 用途 |
|------|------|
| `src/lib/prompts.ts` | 所有 AI prompt 的统一出口 |
| `src/lib/rag.ts` | RAG 检索引擎（BM25 + 向量 RRF 混合） |
| `src/lib/ai.ts` | AI 调用核心（含用量记录 + DB key 热加载） |
| `src/lib/models.ts` | AI Provider 配置（DeepSeek/Zhipu） |
| `src/lib/settings.ts` | 系统设置加密存储（API Key 等敏感配置） |
| `src/lib/admin-auth.ts` | Admin 权限校验（requireAdmin） |
| `src/lib/usage-log.ts` | AI 用量日志（内存环形缓冲） |
| `src/proxy.ts` | Next.js 16 Proxy（认证/限流/路由保护） |
| `src/app/workbench/page.tsx` | 核心工作台 |
| `src/app/admin/layout.tsx` | Admin 布局（nav 分组 + role 门控） |

### 数据流

**AI 写作管道：**
```
Writer (DeepSeek) → Verifier (Zhipu) → Refiner (DeepSeek)
        ↓                    ↓                    ↓
   SSE 流式输出          逐条核实引用         根据意见修正
```

**API Key 热加载：**
```
Admin 填 Key → PUT /api/admin/settings → AES加密 → DB SystemSetting
                                               ↓
callAI() → getApiKeyFromSettings() → 30s TTL 缓存 → 解密 → API
```

**知识库数据源：**
```
主数据源: Prisma KnowledgeFile（771 条记录）
过渡备份: data/metadata.json（双写，逐步废弃）
文本块:   Prisma KnowledgeChunk
```

### Admin 后台（`/admin`）

12 个页面，分 4 组：

| 组 | 页面 | 功能 |
|----|------|------|
| 概览 | 仪表盘 | 统计卡片 + AI 用量 + 项目趋势 |
| | 系统健康 | DB/索引/服务器状态 |
| | 系统设置 | API Key 加密管理（热生效） |
| 内容 | 用户管理 | 搜索/删除/详情/角色切换 |
| | 项目管理 | 搜索/删除/一键工作台 |
| | 文献管理 | 删除/批量删除/单篇重索引 |
| 质量 | 审查记录 | ReviewCheck 列表+详情 |
| | 查重记录 | PlagiarismCheck 列表+详情 |
| 数据 | 使用统计 | AI 调用分布+最近记录 |

## 开发铁律

1. **改前扫描**：修改任何功能前，先 grep 相关引用，确认影响范围
2. **改后验证**：`tsc --noEmit` 必须通过，`npx vitest run` 18 文件 141 测试
3. **不要重复**：新功能前先搜索项目是否已有类似实现
4. **类型严格**：禁止 `any`，所有接口必须有显式类型
5. **流式优先**：AI 生成接口必须支持 SSE streaming
6. **大文件不新增代码**：workbench/page.tsx、writing-panel.tsx、api/writing/route.ts 待拆分
7. **Admin API 必须 requireAdmin**：所有 `/api/admin/*` 路由开头校验管理员权限
8. **DELETE 必须弹确认**：Admin 页面的删除操作不可静默执行
