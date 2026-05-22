# 禾书耕文 (GrainScript) — 农业科研AI辅助写作系统

面向农业科研场景的论文写作与文献辅助平台。基于 Next.js App Router、Prisma/SQLite、本地 RAG 文献库和 AI 流式生成能力，支持从论文选题、大纲、分章节写作、参考文献管理到 PDF/Word 导出的完整工作流。

## 核心功能

| 模块 | 说明 |
|------|------|
| **证据驱动扩写** | 大纲任务驱动，7 步可观察管道：检索文献 → 证据整理 → AI 写作 → 审稿核查 → 主编修正 → 引用校验 → 数据核查 |
| **多代理写作** | Writer (DeepSeek) → Verifier (独立核查) → Refiner (非流式修正) 三级流水线，每步 SSE 推送 |
| **RAG 知识增强** | BM25 + 向量混合检索，索引实验室 PDF 文献，引用编号自动关联原文 |
| **实验数据分析** | 上传 CSV/XLSX → 自动识别列类型 → 统计计算 → EvidenceClaim + ChartConfig 持久化 |
| **一致性检查** | 跨章节术语、数据、逻辑、Overclaim 扫描，AI 修复后合并写入不覆盖 |
| **引用管理** | 正文引用自动重排，真实性校验（文本重叠度检测），数据证据溯源检查 |
| **多格式导出** | SCI / Nature / IEEE / GB/T 7713 / CAS 模板，支持 Word / PDF / Markdown |
| **查重降重** | 本地知识库 + 历史项目交叉比对，AI 辅助改写 |
| **XRD 分析** | 峰拟合、背景扣除、晶胞参数、非晶分析、XPS 分峰 |
| **数据绘图** | 分组柱状图、堆积图、折线图、三线表独立页面 |

## 技术栈

- **前端**: Next.js 16 (Turbopack) + React 19 + Tailwind CSS v4 + Shadcn UI
- **后端**: Next.js API Routes + SSE Streaming
- **数据库**: Prisma + SQLite (36 个 API 路由)
- **AI**: DeepSeek Chat + 智谱 GLM-4 (可选)
- **RAG**: BM25 + 向量余弦混合检索 (RRF 融合)
- **类型安全**: TypeScript strict mode

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

复制 `.env.example` 为 `.env`，至少配置 DeepSeek API Key：

```bash
DEEPSEEK_API_KEY=sk-xxxxxx
DATABASE_URL="file:./prisma/dev.db"
```

可选智谱 AI（用于 Verifier 独立验证）：

```bash
ZHIPU_API_KEY=your_zhipu_api_key
ZHIPU_MODEL=glm-4-plus
```

### 4. 初始化数据库

```bash
npx prisma generate
npx prisma db push
```

### 5. 初始化知识库

将 PDF 文献放入 `热化学小组文章-2024.12.27` 目录后：

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
  → 检索文献 (RAG 搜索本地 PDF 库)
  → 证据整理 (构建 EvidencePack: 文献 + 数据 Claims)
  → AI 写作 (DeepSeek 流式生成初稿)
  → 审稿核查 (独立 AI 验证引用真实性 + Overclaim 扫描)
  → 主编修正 (非流式调用，避免挂起)
  → 引用校验 (文本重叠度检测 + 超范围引用过滤)
  → 数据核查 (EvidenceClaim 编号 + 数值一致性验证)
```

每一步通过 SSE 推送 `pipeline_step` 事件，前端 PipelineTimeline 实时展示进度条。

## 证据驱动写作

两种写作模式（`project.mode` 持久化）：

- **综述模式 (review)**: 文献驱动，基于 RAG 检索结果组织论述
- **研究论文 (research)**: 数据驱动，上传实验数据 → 系统提取 EvidenceClaim → AI 必须引用数据编号 → Verifier 硬校验数值一致性

## 目录结构

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # 36 个 API 路由
│   │   ├── writing/              # 多代理写作管道
│   │   ├── data/analyze/         # 实验数据分析
│   │   ├── consistency/          # 一致性检查 + fix
│   │   ├── projects/[id]/        # meta / section 增量保存
│   │   └── auth/                 # 登录注册
│   ├── workbench/                # 科研工作台
│   ├── projects/                 # 项目管理
│   ├── guide/                    # 使用指南
│   ├── plot/                     # 数据绘图
│   └── presentation/             # 项目演示
├── components/shared/            # 19 个共享组件
│   ├── pipeline-timeline.tsx     # 管道时间线
│   ├── workbench-editor-area.tsx # 编辑器 + AI 预览
│   ├── writing-panel.tsx         # 侧栏扩写面板
│   ├── analysis-panel.tsx        # 数据分析面板
│   └── ...
├── hooks/                        # 11 个 React Hooks
├── lib/                          # 工具库
│   ├── prompts/                  # AI Prompt 模板
│   ├── ai.ts                     # AI 调用封装
│   ├── rag.ts                    # 本地 RAG 引擎
│   └── citation-validator.ts    # 引用 + 数据证据校验
├── services/                     # 14 个后端服务
│   ├── data-analysis.ts          # 统计计算引擎
│   ├── evidence-pack.ts          # 证据包构建
│   └── writing-context.ts        # 写作上下文服务
└── contracts/                    # 前后端类型契约
    ├── sse.ts                    # SSE 事件类型
    ├── writing.ts                # 写作请求/响应
    ├── data-source.ts            # 数据源/证据/图表
    └── consistency.ts            # 一致性问题类型
```

## 常用命令

```bash
npm run dev          # 启动开发服务
npm run build        # 生产构建
npm run typecheck    # TypeScript 类型检查
npm run index-docs   # 重建文献索引
```

## 开发注意事项

- 修改 Prisma schema 后运行 `npx prisma generate && npx prisma db push`
- dev server 运行时 `prisma generate` 可能因文件锁失败，需先停服
- `.env` 不提交 Git，已配置 `.gitignore`
- 运行时数据 (dev.db、RAG 索引、PDF 文献) 不入 Git

## 许可

实验室内部使用 · v2.2.0 · 2026-05
