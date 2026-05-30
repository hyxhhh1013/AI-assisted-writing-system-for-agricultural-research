# 核心业务流程

> 3 个最核心的业务流程，每个标注了涉及的端点、服务、异常分支。
> 更新代码逻辑时同步更新本文档。

---

## 流程 1：AI 写作管道

**触发**: 用户在工作台点击"扩写"或"AI 写作"
**入口**: `src/hooks/use-writing-stream.ts` → `src/app/api/writing/route.ts` (436行)

```
用户选大纲任务 → 点击扩写
  │
  ├─ 1. 检索文献
  │   调用: src/lib/rag.ts (search方法, BM25+向量 RRF)
  │   输入: 大纲任务的关键词 + 项目已有内容
  │   输出: top_k 个相关文献片段 + 文件名
  │   SSE: pipeline_step { step: "retrieving", progress: 0.1 }
  │
  ├─ 2. 证据整理
  │   调用: src/services/evidence-pack.ts
  │   输入: RAG 检索结果 + 项目 dataClaims
  │   输出: EvidencePack { sources[], claims[], context }
  │   SSE: pipeline_step { step: "preparing_evidence", progress: 0.2 }
  │
  ├─ 3. AI 写作 (Writer)
  │   调用: src/lib/ai.ts (callAI, stream=true)
  │   模型: DeepSeek Chat (默认) 或 智谱 GLM-4
  │   Prompt: src/lib/prompts/writing.ts
  │   输入: EvidencePack + 大纲上下文 + 写作指令
  │   输出: 流式 Markdown 文本
  │   SSE: stream_token { token, progress }
  │
  ├─ 4. 审稿核查 (Verifier)
  │   调用: src/lib/ai.ts (callAI, stream=false)
  │   模型: 独立模型（通常用智谱，与 Writer 不同）
  │   输入: Writer 产出 + EvidencePack
  │   检查: 引用真实性、数据一致性、Overclaim
  │   输出: Issue[] 列表
  │   SSE: pipeline_step { step: "verifying", issues: [...] }
  │
  ├─ 5. 主编修正 (Refiner)
  │   调用: src/lib/ai.ts (callAI, stream=false)
  │   触发条件: Verifier 发现 issues (否则跳过)
  │   输入: Writer 产出 + Verifier issues
  │   输出: 修正后的文本
  │   SSE: pipeline_step { step: "refining" }
  │
  ├─ 6. 引用校验
  │   调用: src/lib/citation-validator.ts
  │   检查: [N] 引用是否对应真实 RAG 源、文本重叠度
  │   过滤: 超范围引用、虚假引用
  │   SSE: pipeline_step { step: "validating_citations" }
  │
  └─ 7. 数据核查
      调用: src/lib/citation-validator.ts (数据模式)
      检查: EvidenceClaim 编号连续性、数值一致性
      SSE: pipeline_step { step: "checking_data", progress: 0.95 }
      最终: pipeline_complete
```

**异常处理**:
- AI 调用超时 (60s) → `fetchWithRetry` 自动重试 2 次，失败则 SSE error 事件
- RAG 检索无结果 → 降级为纯 Prompt 写作（无文献增强）
- Verifier 检查失败 → 跳过 Refiner，保留 Writer 产出

**涉及文件**:
| 层 | 文件 |
|----|------|
| Hook | `src/hooks/use-writing-stream.ts` |
| API | `src/app/api/writing/route.ts` |
| Prompt | `src/lib/prompts/writing.ts` |
| RAG | `src/lib/rag.ts` |
| AI | `src/lib/ai.ts` |
| 验证 | `src/lib/citation-validator.ts` |
| 类型 | `src/contracts/writing.ts` · `src/contracts/sse.ts` |

---

## 流程 2：RAG 知识库检索

**触发**: PDF 上传 / AI 写作时自动调用 / 用户在知识库页面手动搜索
**入口**: `src/lib/rag.ts` (433行，LocalRAG 类) · `src/app/api/knowledge/route.ts`

```
PDF 文献入库
  │
  ├─ 1. PDF 解析
  │   调用: src/app/api/pdf/route.ts → pdf-parse
  │   输出: 原始文本
  │
  ├─ 2. 分块 (Chunk)
  │   调用: LangChain RecursiveCharacterTextSplitter
  │   参数: chunk_size=500, overlap=50
  │   输出: 文本片段数组
  │
  ├─ 3. 向量化 (可选)
  │   调用: 外部 Embedding API (如启用)
  │   存储: KnowledgeChunk.embedding (JSON 字符串)
  │   模型: 配置在 .env 的 RAG_EMBEDDING_MODEL
  │
  ├─ 4. 写数据库
  │   调用: Prisma KnowledgeFile + KnowledgeChunk
  │   去重: 按 KnowledgeFile.name unique 约束
  │
  └─ 5. 构建索引
      调用: scripts/index-pdfs.mjs
      输出: data/ 下 8 个分类索引文件 + metadata.json
      格式: JSON，按 category 分文件

检索时
  │
  ├─ BM25 关键词检索
  │   输入: 查询文本
  │   算法: 对 chunk content 做分词 + TF-IDF 评分
  │
  ├─ 向量语义检索 (如启用)
  │   输入: 查询向量 (调用 Embedding API)
  │   计算: 余弦相似度 (src/lib/similarity.ts)
  │
  └─ RRF 融合
      算法: Reciprocal Rank Fusion
      参数: k=60 (默认)
      输出: top_k 排序结果 (默认 5)
```

**异常处理**:
- PDF 解析失败 → 跳过该文件，记录到 usage-log
- Embedding API 不可用 → 降级为纯 BM25 检索
- 知识库为空 → 提示用户先上传文献

**涉及文件**:
| 层 | 文件 |
|----|------|
| 核心 | `src/lib/rag.ts` |
| API | `src/app/api/knowledge/*` · `src/app/api/pdf/route.ts` |
| 索引 | `scripts/index-pdfs.mjs` |
| 数据 | `data/` (8 个分类索引) |
| 类型 | `src/lib/similarity.ts` |

---

## 流程 3：图表生成管道

**触发**: AI 写作输出 `【FIGURE:{type, ...}】` 标记 / 用户在 plot 页面手动生成
**入口**: `src/hooks/use-figure-pipeline.ts` (309行) → `src/app/api/chart/route.ts`

```
检测到 【FIGURE:{...}】 标记
  │
  ├─ 1. 解析 FigureSpec
  │   调用: src/contracts/figure.ts (FigureSpec 类型)
  │   输入: AI 写作输出的 Markdown
  │   输出: FigureSpec { type, data, title, xlabel, ylabel, ... }
  │   验证: Zod schema 校验参数完整性
  │
  ├─ 2. 路由到 Python 脚本
  │   调用: child_process.spawn(PYTHON_CMD, [script, args])
  │   注册表: scripts/charts/registry.json (15 种图形)
  │   参数: JSON 序列化的 FigureSpec → stdin / 命令行参数
  │   Python: scripts/charts/chart_base.py (自动扫描 chart_types/)
  │
  ├─ 3. matplotlib 渲染
  │   环境: .env 中的 PYTHON_CMD 指向的 Python
  │   依赖: matplotlib + CJK 字体 (scripts/charts/plot_utils.py)
  │   输出: PNG 文件 → public/charts/
  │
  └─ 4. Markdown 替换
      调用: src/lib/utils.ts (内容管道)
      替换: 【FIGURE:{...}】 → ![](public/charts/figure_xxx.png)
      持久化: Project.charts JSON 字段更新
```

**异常处理**:
- Python 不可用 → 返回错误信息，保留标记不替换
- 图表参数非法 → Zod 校验失败，SSE error 事件
- 渲染超时 (30s) → kill 子进程，返回超时错误
- CJK 字体缺失 → fallback 到 sans-serif

**涉及文件**:
| 层 | 文件 |
|----|------|
| Hook | `src/hooks/use-figure-pipeline.ts` |
| API | `src/app/api/chart/route.ts` · `src/app/api/figures/registry/route.ts` |
| Python | `scripts/charts/` (15 种图形) |
| 注册表 | `scripts/charts/registry.json` |
| 组件 | `src/components/shared/chart-panel.tsx` |
| 类型 | `src/contracts/figure.ts` |

---

## SSE 事件类型（写作管道用）

所有 SSE 事件定义在 `src/contracts/sse.ts`：

| 事件 | 触发时机 | payload |
|------|---------|---------|
| `pipeline_step` | 每个管道步骤开始 | `{ step, progress, message }` |
| `stream_token` | Writer 流式输出 | `{ token, progress }` |
| `pipeline_error` | 任何步骤出错 | `{ step, error, recoverable }` |
| `pipeline_complete` | 管道完成 | `{ steps, totalTime }` |
| `verifier_issues` | 审稿发现问题 | `{ issues: Issue[] }` |
| `refiner_diff` | Refiner 修改对比 | `{ original, refined }` |
