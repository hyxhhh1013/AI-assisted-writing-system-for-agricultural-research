# 农业科研 AI 辅助写作系统 (Agri-AI Assistant)

面向农业科研场景的论文写作与文献辅助平台。系统基于 Next.js App Router、Prisma/SQLite、本地 RAG 文献库和 AI 流式生成能力，支持从论文选题、大纲、分章节写作、参考文献管理到 PDF/Word 导出的完整工作流。

## 核心功能

- **论文项目管理**：使用 Prisma + SQLite 保存论文元数据和章节内容。
- **论文大纲生成**：根据研究方向与本地文献库生成结构化论文大纲。
- **多代理扩写流程**：Writer → Verifier → Refiner 三阶段流水线，支持独立模型验证。
- **本地知识库 RAG**：BM25 + 向量混合检索，索引实验室 PDF 文献。
- **学术核查与自动修正**：Verifier 代理核查引用准确性，Refiner 自动修正。
- **跨章节一致性检查**：检查各章节之间的术语、数据、逻辑和结论一致性。
- **参考文献引用重排**：按正文首次出现顺序重排参考文献并同步改写编号。
- **多模板论文预览与导出**：支持 SCI、IEEE、GB/T 7713、Nature、CAS 风格预览及 PDF/Word 导出。

## 技术栈

- **前端**：Next.js 16 App Router、React 19、Tailwind CSS v4、Shadcn UI
- **后端**：Next.js Route Handlers、Prisma 6、SQLite
- **AI**：DeepSeek Chat、智谱 GLM-4（可选）、DeepSeek Embedding
- **RAG**：BM25 关键词 + 向量余弦混合检索（RRF 融合）
- **文档处理**：Playwright/Chromium PDF、docx、PDF.js

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

复制 `.env.example` 为 `.env.local`，至少配置 DeepSeek API Key：

```bash
DEEPSEEK_API_KEY=sk-xxxxxx
DATABASE_URL="file:./dev.db"
```

可选配置智谱 AI（用于 Verifier 独立验证）：

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

将 PDF 文献放入 `热化学小组文章-2024.12.27` 目录，然后运行：

```bash
npm run index-docs
```

### 6. 启动开发服务

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 开始使用。

## 多代理架构

系统实现了 Writer/Verifier/Refiner 三阶段写作流水线：

```
Writer（DeepSeek） → Verifier（智谱AI / DeepSeek） → Refiner（DeepSeek）
```

- **Writer**：根据 RAG 上下文和章节指令生成初稿，流式输出到前端
- **Verifier**：独立模型核查引用准确性和事实正确性，防止模型虚构
- **Refiner**：根据 Verifier 报告自动修正，保留必要引用而非删除

当 Verifier 使用与 Writer 不同的模型时，实现真正的独立验证。Verifier 和 Refiner 可在 `src/lib/models.ts` 中按角色独立配置。

## 目录结构

- `src/app/api`：API Route Handlers
  - `writing/` — 多代理写作流程（Writer → Verifier → Refiner）
  - `outline/` — 大纲生成
  - `analysis/` — 数据分析
  - `translate/` — 文本翻译
  - `consistency/` — 跨章节一致性检查
  - `knowledge/` — 知识库文件管理
  - `export/pdf/` — 服务端 PDF 导出
- `src/lib`：核心工具库
  - `models.ts` — 模型提供者配置（DeepSeek / 智谱AI）
  - `prompts.ts` — 集中式 Prompt 管理
  - `ai.ts` — 共享 AI 调用工具
  - `rag.ts` — 本地 RAG 引擎
  - `citation-validator.ts` — 引用真实性校验
  - `reference-reorder.ts` — 引用重排
- `src/components/shared`：业务组件（写作面板、分析面板等）
- `src/services`：PDF 导出等服务封装
- `prisma/`：数据库 Schema
- `scripts/`：离线文献索引脚本

## 常用命令

```bash
npm run dev          # 启动开发服务
npm run build        # 生产构建检查
npm run start        # 启动生产服务
npm run lint         # 运行 ESLint
npm run index-docs   # 重建本地文献索引（增量）
```

## 开发注意事项

- 修改 Prisma schema 后运行 `npx prisma generate && npx prisma db push`
- PDF 导出依赖 Playwright Chromium，部署环境同样需要安装
- `.env`、`.env.local` 不应提交到 Git，已配置 `.gitignore`
- 运行时数据（SQLite 数据库、RAG 索引、PDF 文献库）不纳入 Git 追踪

## 许可

实验室内部使用。
