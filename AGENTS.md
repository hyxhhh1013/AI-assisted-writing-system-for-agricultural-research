<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 禾书耕文 (GrainScript) — L1 热启动内核

> 最后更新：2026-08-06  
> 冷文档与索引见 [`docs/`](./docs/)（分层协议下文 S0）。

## S0: 文件协议（知识分层）

| 层级 | 内容 | 位置 |
|------|------|------|
| **L1** | 热规则、铁律、检查清单 | **本文件** `AGENTS.md` |
| **L2** | 功能 → 代码入口 | [`docs/DOMAIN_INDEX.md`](./docs/DOMAIN_INDEX.md) |
| **L3** | 写作 / RAG / 图表 / 审查查重 / Agent | [`docs/domain/`](./docs/domain/) |
| **L4** | API 表、DB、技术细则 | [`docs/API_INDEX.md`](./docs/API_INDEX.md)、[`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md)、[`docs/KERNEL.md`](./docs/KERNEL.md) |

### 🔒 文档同步铁律（无条件执行）

> 只要属于**功能/修复**（而非纯拼写/格式化），提交前**必须**同步受影响文档。
> 禁止「先功能后补文档」「等发版一起更」「文档没人看不更」。**文档滞后 = 功能未完成。**

**强制流程（改动 → 提交前必须走完）：**

1. 对照下方**更新表**，找出本改动命中的文档。
2. 更新命中文档：新增/修改的 API、域、SSE 事件、DB 字段、业务规则，全部落到对应 `docs/` 摘要。
3. 功能改动与文档改动进**同一个 commit**（不拆散，保证可追溯）。
4. 提交前自检：若本次 `src/` 有净改动而没有任何 `docs/` 改动，必须在 commit message 显式写 `docs: 无需更新（理由）`。写不出理由 = 漏更。
5. 命中接力队列：同步 `docs/ENGINEERING_OPTIMIZATION_QUEUE.md` 状态。

**更新规则（改代码后对照）**

| 改动类型 | 更新 |
|----------|------|
| 新功能域 / 新页面 | `DOMAIN_INDEX.md` |
| 新/改 API 路由 | `API_INDEX.md` + 必要时 `validations.ts` |
| Prisma 表/字段 | `schema.prisma` + `DATA_MODEL.md` |
| 写作管道 / SSE | `domain/writing-pipeline.md` + `contracts/sse.ts` |
| **Agent 编排 / 图 / 会话** | `domain/agent.md` + `contracts/agent.ts` |
| **Agent SSE 事件（含新增类型）** | `domain/agent.md` §SSE 事件表 + `API_INDEX.md` |
| RAG / 知识库 | `domain/rag-and-knowledge.md` + `rag-index-refactor.md` |
| 图表 / Python | `domain/figures-and-python.md` + `registry.json` |
| 审查 / 查重 | `domain/review-plagiarism.md` |
| 新/改 API 路由（批量） | `npm run docs:api-index` → `API_INDEX.md` |
| Prompt 业务规则 | `lib/prompts/*.ts` + 对应 `domain/*.md` 摘要 |
| 工程任务状态 | `ENGINEERING_OPTIMIZATION_QUEUE.md` §1 + §4 |

**禁止**：把行数统计、会话复盘、完整 API 长表塞回本文件。

**任务模板**：[`docs/VIBECODING.md`](./docs/VIBECODING.md)  
**接力队列**：[`docs/UI_COMPLETION_QUEUE.md`](./docs/UI_COMPLETION_QUEUE.md)、[`docs/ENGINEERING_OPTIMIZATION_QUEUE.md`](./docs/ENGINEERING_OPTIMIZATION_QUEUE.md)

---

## S1: 身份

- **产品**：农业科研 AI 辅助写作（论文结构、扩写、引用、图表、查重、审查）。
- **维护者**：实验室单人，主要通过 Cursor / Claude 开发，**规范要让 AI 可读、可执行**。
- **语言**：与用户沟通用中文；代码与 commit 描述清晰即可。
- **Commit**：`feat(scope): 简述 (ENG-PR-xxx)` 或 `refactor/fix/docs`，scope 示例：`writing`、`knowledge`、`admin`。

### 对话约定（命令速记）

| 用户说 | 含义 |
|--------|------|
| **乐迪启动** | 在本地把项目搭起来并启动：`npm install --legacy-peer-deps` → `npx prisma generate` → `npx prisma db push` → 确认 `.env`（缺则 `cp .env.example .env`，至少填 `DEEPSEEK_API_KEY`）→ `npm run dev` → 打开 `http://localhost:3000` |

---

## S2: 业务不变量（热加载）

### 写作与引用

- 扩写管道：**Writer (DeepSeek) → Verifier (Zhipu/fallback) → Refiner**，SSE 事件类型以 `contracts/sse.ts` 为准。
- 引用编号必须在检索得到的 `[1]…[N]` 内；越界 strip 并向前端发 warnings。
- Prompt 层已含学术写作原则（overclaim、Results/Discussion 分离等）；**改规则先改 `lib/prompts.ts`，再改** `docs/domain/writing-pipeline.md` 摘要。

### 项目保存

- **Section**：增量 `PATCH .../sections/[key]`。
- **References / AnalysisResults**：增量 PATCH，**禁止**全量 POST 覆盖（`saveProject` 已剥离）。
- **禁止**组件内 `fetch('/api/...')` → 用 `src/services/`。

### 知识库

- 书目元数据权威源：**Prisma `KnowledgeFile`**（非 `metadata.json`）。
- RAG 索引文件在 `data/`；大文件异步加载，禁止同步读巨型 JSON（见 RAG-PR 队列）。

### Admin

- 所有 `/api/admin/*` 开头 **`requireAdmin()`**。
- Admin 页 **DELETE 必须确认弹窗**。
- API Key：DB 加密，**30s 热加载**，勿写死环境变量到代码。

### 图表

- 图表类型唯一注册表：`scripts/charts/registry.json`。
- Python 只用 **`process.env.PYTHON_CMD`**。

### 审查与查重

- 审查：**`review-service.ts`**，四维度 JSON 报告，路由 `POST /api/review`。
- 查重：业务只在 **`plagiarism-service.ts`**；`v2` 路由为薄壳，可选 SSE 进度（非 Writing SSE 类型）。

---

## S3: 架构索引

### 技术栈（勿猜）

| 层 | 技术 |
|----|------|
| 框架 | Next.js 16 App Router + Turbopack |
| UI | Tailwind v4 + Shadcn |
| 编辑器 | TipTap / Textarea |
| DB | Prisma + PostgreSQL |
| 认证 | JWT + HTTP-only cookie；`src/proxy.ts` |
| AI | DeepSeek（写）+ Zhipu（审） |
| RAG | BM25 + 向量 RRF |
| 图表 | Python matplotlib 子进程 |
| 字体 | 系统栈，不用 Google Fonts |

### 目录职责

| 目录 | 职责 |
|------|------|
| `src/contracts/` | 前后端共享类型 |
| `src/services/` | API 封装（纯函数） |
| `src/hooks/` | React 状态与副作用 |
| `src/lib/` | prompts、rag、ai、prisma… |
| `src/app/api/` | Route Handlers |
| `src/components/shared/` | 业务组件 |
| `scripts/` | 索引、迁移、Python 图表 |
| `prisma/` | Schema |

### 关键文件（改动前必读）

| 文件 | 用途 |
|------|------|
| `src/lib/prompts.ts` | Prompt 统一出口 |
| `src/lib/rag.ts` | RAG 引擎 |
| `src/lib/ai.ts` | AI 调用 + Key 热加载 |
| `src/proxy.ts` | 认证 / 限流 |
| `src/app/api/writing/run-pipeline.ts` | 写作五阶段编排 |
| `src/app/workbench/page.tsx` | 工作台（慎增代码） |
| `src/lib/agent/tools/registry.ts` | Agent 工具唯一挂载表（加工具改这里，不改循环） |
| `src/components/shared/writing-panel.tsx` | 扩写 UI（待拆） |

### 数据流（简图）

```text
UI → services → API → Prisma / RAG / callAI → SSE/JSON → UI
```

Admin Key：`PUT /api/admin/settings` → DB → `callAI()` 读缓存。

---

## S4: 编码规范

1. **改前** `rg` 引用；**改后** `npm run check`（或 `tsc` + `vitest`）。
2. **禁止 `any`**；类型放 `contracts/`。
3. **流式 AI** 必须 SSE，形状对齐 `WritingSSEEvent`。
4. **新 API 写操作** 接 `validateBody` + zod（见 `API_INDEX.md`）。
5. **大文件**：`workbench/page.tsx`、`writing-panel.tsx` 不堆新逻辑 → hooks / 子模块。
6. **不重复造轮子**：先搜项目现有实现。
7. 细则：[`docs/KERNEL.md`](./docs/KERNEL.md)、[`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md)。

---

## S5: 完成检查清单

- [ ] 影响范围已搜索，未误改 `backup_*`
- [ ] 未在组件中新增裸 `fetch`
- [ ] 项目保存走增量 PATCH（若 touched）
- [ ] `npx tsc --noEmit` 通过
- [ ] 相关 vitest 通过（`npx vitest run`）
- [ ] 本地提交前：`git commit` 会跑 `tsc` + 暂存文件的 `eslint`（husky；全量 `npm run check` 仍建议在合并前手动跑）
- [ ] **文档同步铁律**：本次功能改动对应的 `docs/` 已更新，且与代码同一 commit（若确无需更新，commit message 已显式声明 `docs: 无需更新（理由）`）
- [ ] 命中接力队列：已更新 `docs/ENGINEERING_OPTIMIZATION_QUEUE.md` §1 + §4

---

## 当前工程快照（2026-06-02）

| 项 | 状态 |
|----|------|
| `/api/writing` | 已拆 `pipeline/*`，route ~90 行（ENG-PR-030 done） |
| `writing-panel.tsx` | 已拆 hooks + `writing/*` 子组件（ENG-PR-031 done，~423 行） |
| references / analysis PATCH | done（025/026/025b） |
| 知识库元数据 | Prisma 主源（027/028 done） |
| RAG 二进制索引 | RAG-PR-001～005 done |
| 组件 fetch → services | ENG-PR-020～022 done |
| `ProjectData` 类型 | 以 `@/contracts/project` 为准（062 done） |
| 重路由 lazy | `/plot`、`/reader`、`/admin` 首屏 dynamic（060 done） |
| pre-commit | husky：`typecheck` + `lint-staged`（061 done） |

技术债与 PR 编号：[`docs/ENGINEERING_OPTIMIZATION_QUEUE.md`](./docs/ENGINEERING_OPTIMIZATION_QUEUE.md) §1、§8。Bundle 分析：`npm run analyze`（`ANALYZE=true next build`）。
