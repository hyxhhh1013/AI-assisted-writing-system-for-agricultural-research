# 禾书耕文 (GrainScript) — 农业科研 AI 辅助写作系统

面向农业科研场景的论文写作与文献辅助平台。基于 Next.js App Router、Prisma/PostgreSQL、本地 RAG 文献库和 AI 流式生成能力，支持从论文选题、大纲、分章节写作、参考文献管理到 PDF/Word 导出的完整工作流。

## 核心功能

| 模块 | 说明 |
|------|------|
| **证据驱动扩写** | 大纲任务驱动，7 步可观察管道：检索文献 → 证据整理 → AI 写作 → 审稿核查 → 主编修正 → 引用校验 → 数据核查 |
| **多代理写作** | Writer (DeepSeek) → Verifier (独立核查) → Refiner (非流式修正) 三级流水线，每步 SSE 推送 |
| **RAG 知识增强** | BM25 + 向量混合检索，索引实验室 PDF 文献，引用编号自动关联原文 |
| **实验数据分析** | 上传 CSV/XLSX → 自动识别列类型 → 统计计算 → EvidenceClaim + ChartConfig 持久化 |
| **一致性检查** | 跨章节术语、数据、逻辑、Overclaim 扫描，AI 修复后合并写入不覆盖 |
| **引用管理** | 正文引用自动重排，真实性校验（文本重叠度检测），数据证据溯源检查 |
| **审查中心** | 四维度论文审查（学术/论证/结构/诚信），结构化报告入库 |
| **查重降重** | 本地库 + 跨项目 + 知识库 + 可选联网；AI 改写建议 |
| **多格式导出** | SCI / Nature / IEEE / GB/T 7713 / CAS 模板，支持 Word / PDF / Markdown |
| **XRD 分析** | 峰拟合、背景扣除、晶胞参数、非晶分析、XPS 分峰 |
| **数据绘图** | 分组柱状图、堆积图、折线图、三线表独立页面 |

## 技术栈

- **前端**: Next.js 16 (Turbopack) + React 19 + Tailwind CSS v4 + Shadcn UI
- **后端**: Next.js Route Handlers + SSE Streaming
- **数据库**: Prisma + **PostgreSQL**（本地安装本机 PostgreSQL，默认 `localhost:5433`）
- **AI**: DeepSeek Chat（主写）+ 智谱 GLM-4（Verifier，可选）
- **RAG**: BM25 + 向量余弦混合检索 (RRF 融合)，索引文件 `data/index_*.json` + `.emb`
- **图表**: Python (matplotlib) 子进程，`PYTHON_CMD` 环境变量
- **类型安全**: TypeScript strict mode
- **API**: 57 个 Route Handler（索引见 [`docs/API_INDEX.md`](docs/API_INDEX.md)）

## 开发规范（AI / 协作）

分层文档（参考 onion L1～L4 协议）：

| 层级 | 文档 |
|------|------|
| L1 热规则 | [`AGENTS.md`](AGENTS.md) |
| L2 功能索引 | [`docs/DOMAIN_INDEX.md`](docs/DOMAIN_INDEX.md) |
| L3 业务 | [`docs/domain/`](docs/domain/)（写作、RAG、图表、审查查重） |
| L4 冷文档 | [`docs/API_INDEX.md`](docs/API_INDEX.md)、[`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)、[`docs/KERNEL.md`](docs/KERNEL.md) |
| 任务模板 | [`docs/VIBECODING.md`](docs/VIBECODING.md) |

改 API 路由后：`npm run docs:api-index`。

## 快速开始

### 1. 安装依赖

```bash
npm install --legacy-peer-deps
```

### 2. 安装 Playwright Chromium

PDF 导出依赖服务端 Chromium：

```bash
npx playwright install chromium
```

### 3. 配置环境变量

复制 [`.env.example`](.env.example) 为 `.env`，至少配置 DeepSeek API Key 与数据库：

```bash
DEEPSEEK_API_KEY=sk-xxxxxx
DATABASE_URL=postgresql://grainscript:grainscript_dev_2024@localhost:5433/grainscript
```

可选智谱 AI（Verifier 独立验证）：

```bash
ZHIPU_API_KEY=your_zhipu_api_key
ZHIPU_MODEL=glm-4-plus
```

文献目录（默认 `papers/`，可用 `RAG_ARTICLES_DIR` 覆盖）：

```bash
RAG_ARTICLES_DIR=papers
PYTHON_CMD=python3
```

### 4. 初始化本机 PostgreSQL

确保本机 PostgreSQL 已安装并在运行（本仓库默认端口 `5433`），库与用户可用：

```sql
CREATE ROLE grainscript LOGIN PASSWORD 'grainscript_dev_2024';
CREATE DATABASE grainscript OWNER grainscript;
```

然后：

```bash
npx prisma generate
npx prisma db push
```

### 5. 初始化知识库

将 PDF 放入 `papers`（或 `RAG_ARTICLES_DIR` 指定目录）后：

```bash
npm run index-docs
```

### 6. 启动

```bash
npm run dev
```

访问 `http://localhost:3000` → 注册 → 创建项目 → 上传文献 → 开始写作。

## 写作管道架构

```
点击扩写
  → 检索文献 (RAG)
  → 证据整理 (EvidencePack)
  → AI 写作 (DeepSeek 流式)
  → 审稿核查 (Verifier)
  → 主编修正 (Refiner，非流式)
  → 引用校验 + 数据证据核查
```

实现拆分见 `src/app/api/writing/`（`run-pipeline.ts` + `pipeline/*`）。每一步通过 SSE `pipeline_step` 等事件推送进度。

## 证据驱动写作

两种写作模式（`project.mode` 持久化）：

- **综述模式 (review)**: 文献驱动，基于 RAG 检索结果组织论述
- **研究论文 (research)**: 数据驱动，EvidenceClaim → AI 引用数据编号 → Verifier 校验

## 目录结构（摘要）

```
src/
├── app/api/              # Route Handlers（见 docs/API_INDEX.md）
│   ├── writing/          # 多代理写作管道（已拆 pipeline/）
│   ├── projects/         # 增量 PATCH sections / references / analysis
│   └── admin/            # 管理后台 API
├── app/workbench/        # 科研工作台
├── components/shared/    # 业务组件（writing-panel、review、…）
├── hooks/
├── lib/                  # prompts、rag、ai、…
├── services/             # 前端 API 封装（禁止组件内 fetch）
└── contracts/            # 共享类型（含 sse.ts）
scripts/                  # index-pdfs、图表 Python、docs:api-index
prisma/                   # PostgreSQL schema
data/                     # RAG 索引（不入 Git 大文件时需按 DEPLOY 配置）
```

## 常用命令

```bash
npm run dev              # 开发服务
npm run build            # 生产构建
npm run analyze          # Bundle 报告（ANALYZE=true，需先 build）
npm run check            # typecheck + test + lint
npm run test:e2e         # Playwright 冒烟（需 DB + create-admin，见下）
npm run index-docs       # 重建文献索引
npm run docs:api-index   # 刷新 docs/API_INDEX.md 路由表
```

### E2E 冒烟前置

`npm run test:e2e` 会拉起 `npm run dev`（非 CI 时可复用已有 dev server）。需：

1. 本机 PostgreSQL 已启动，`.env` 配置 `DATABASE_URL`（默认 `localhost:5433`）
2. `npx prisma migrate deploy`（或 `db push`）+ `npm run create-admin`
3. 可选 `E2E_EMAIL` / `E2E_PASSWORD`（默认 `admin@lab.local` / `admin123456`）
4. 首次运行：`npx playwright install chromium`

## 开发注意事项

- 修改 `prisma/schema.prisma` 后：`npx prisma generate && npx prisma db push`，并更新 `docs/DATA_MODEL.md`
- dev server 运行时 `prisma generate` 可能因文件锁失败，需先停服
- `.env` 不提交 Git；生产密钥走 Admin 系统设置或环境变量
- RAG 索引与 PDF 体积大，按 `.gitignore` / `DEPLOY.md` 管理

## 文档索引

| 文档 | 内容 |
|------|------|
| [AGENTS.md](AGENTS.md) | **AI 协作主入口**（L1 热规则） |
| [docs/DOMAIN_INDEX.md](docs/DOMAIN_INDEX.md) | 功能 → 文件/API 地图 |
| [docs/API_INDEX.md](docs/API_INDEX.md) | 路由表（脚本自动生成 + 人工备注） |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Prisma 语义与保存策略 |
| [docs/KERNEL.md](docs/KERNEL.md) | Next / AI / Python 技术细则 |
| [docs/VIBECODING.md](docs/VIBECODING.md) | 单次功能开发模板 |
| [docs/ENGINEERING_OPTIMIZATION_QUEUE.md](docs/ENGINEERING_OPTIMIZATION_QUEUE.md) | 工程 PR 接力队列 |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | 系统架构、ERD（历史文档，与 L2 索引互补） |
| [DEPLOY](docs/DEPLOY.md) | 部署与 RAG 迁移 |
| [CONVENTIONS](docs/CONVENTIONS.md) | 规范地图 |

## 文档索引

| 文档 | 内容 |
|------|------|
| [DEVELOPMENT_WORKFLOW](docs/DEVELOPMENT_WORKFLOW.md) | 开发、提交、部署总规范 |
| [DEPLOY_VPS](docs/DEPLOY_VPS.md) | 腾讯云自动部署 |
| [DEPLOY_SETUP_CHECKLIST](docs/DEPLOY_SETUP_CHECKLIST.md) | 第一次配部署清单 |

## 许可

实验室内部使用 · 2026-06
