# 知识库与 RAG（L3 业务）

> 性能重构清单：[`../rag-index-refactor.md`](../rag-index-refactor.md)。

## 数据流

```text
PDF 文件 (papers/ 或 RAG_ARTICLES_DIR)
    → index-pdfs.mjs（三阶段）
    → data/index_<分类>.json + index_<分类>.emb
    → sync-knowledge-metadata-to-prisma.mjs → Prisma KnowledgeFile
    → lib/rag.ts（BM25 + 向量 RRF）
    → /api/chat、writing 检索、outline 等
```

## 三阶段索引（`scripts/index-pdfs.mjs`）

| 阶段 | 作用 | 缓存 / 输出 |
|------|------|-------------|
| **Stage 1** | PDF → 文本块 | `data/chunks_raw/<hash>.json`；状态 `data/chunks_raw/_stage1_state.json` |
| **Stage 2** | 乱码过滤、分类写入、Prisma 元数据同步 | `data/index_<分类>.json`（无 embedding）+ 可选 `.emb` |
| **Stage 3** | 新块 embedding（需 API Key） | 追加/重写 `index_<分类>.emb` |

常用 CLI：

```bash
node scripts/index-pdfs.mjs                  # 增量全量
node scripts/index-pdfs.mjs --force-stage1   # 强制重解析 PDF（刷新书目 + 块）
node scripts/index-pdfs.mjs --force-stage3   # 强制重算向量
node scripts/index-pdfs.mjs --skip-stage3    # 仅 BM25（无 embedding）
node scripts/index-pdfs.mjs --files=a.pdf    # 单篇（可配合 force-stage1/3）
node scripts/index-pdfs.mjs --progress       # 输出 SSE 进度行（API reindex 使用）
```

Stage 2 结束必须发出 `type: "complete"` 事件；若脚本异常退出且未 emit `complete`，前端会报 **「索引流意外结束」**，Prisma `chunkCount` 可能仍为 0。

## 书目元数据（ENG-PR-027/028 后）

- **读**：`src/lib/knowledge-metadata.ts` → Prisma `KnowledgeFile`
- **写**：`POST /api/knowledge` 上传时只 upsert 基础字段；完整书目在 **索引 Stage 2** 后由 `sync-knowledge-metadata-to-prisma.mjs` 写入
- **Fallback**：`USE_METADATA_JSON_FALLBACK=true` 时才读旧 `data/metadata.json`
- **用户编辑保护**：`bibEdited=true` 时，自动解析不覆盖 `bib` / `documentType`

### Stage 1 自动解析链

```text
前 3 页文本 + headerLines（Y 坐标行）
  → doc-type-registry.mjs（patent / book / journal）
  → journal.mjs：首页正则 + 文件名 + PDF Info
  → crossref.mjs（有 DOI 且缺字段时，Crossref API 补全）
```

| 模块 | 路径 |
|------|------|
| 类型注册 | `scripts/doc-type-registry.mjs` |
| 期刊提取 | `scripts/extractors/journal.mjs` |
| 行结构 | `scripts/extractors/header-lines.mjs` |
| DOI 补全 | `scripts/extractors/crossref.mjs` |

环境变量：

| 变量 | 说明 |
|------|------|
| `DISABLE_CROSSREF_ENRICH=1` | 关闭 Crossref 补全（离线/限流） |
| `CROSSREF_MAILTO` | Crossref User-Agent 联系邮箱（ polite pool） |
| `RAG_ARTICLES_DIR` | PDF 根目录，默认 `papers` |

单测：`src/__tests__/scripts/journal-extract.test.ts`

## RAG 引擎要点

- `localRAG`：BM25 + 余弦相似度，RRF 融合；**查询同义词扩展 + 多 query RRF**（`lib/rag-query-expand.ts`）
- `getBibMap` / `getCategories` / `search` 走 Prisma 缓存
- 写作上下文：`services/writing-context.ts` 组装 `contextText` + `refMapping`
- **WRITE-NO-RAG（2026-08-17）**：`retrieveWritingContext` 在项目已有 soft-groundable 摘要（默认 ≥1）且未勾选知识库来源时**跳过** `searchWritingRagChunks`，避免离题库内文献抢引用位；`retrieveWritingPreview` **始终**走 RAG。强制检索：`WRITING_FORCE_KNOWLEDGE_RAG=1` 或 `WRITING_SKIP_KNOWLEDGE_RAG=0`。

### 检索性能（库变大后）

- **两阶段检索**：先 BM25（含同义词扩展词项）召回候选；向量在候选集上精排。**BM25 弱命中**（候选过少或最高分偏低）时对该分类**全池向量扫描**，避免语义相关但被 lexical 挡住的片段。
- **多 query RRF**：`expandRagQueries` 自动生成 2～4 个变体（如 `biochar` ↔ `生物炭`），分路检索再 RRF 合并（默认开启，`multiQuery: false` 可关）。
- **查询分类提示**：`inferCategoriesFromQuery` 从 query 推断分类（茶/热解/biochar 等）；全库检索时**优先在相关分类子集检索**，避免大块分类（如控释肥类）压制 Top1；命中不足再与全库 RRF 合并。
- **索引 n-gram 对齐（RAG-PR-013）**：倒排写入 CJK char + bigram（短段补 trigram），与 query 分词一致；否则「热解」「生物炭」等词在 BM25 侧几乎失联。
- **题名/文件名加权 + 轻量重排**：`applyMetadataBoost` / `lexicalRerank` 用 bib.title 与 source 抬高相关 chunk。
- **条件化 multi-query**：默认 `auto`——弱召回、纯英文、或 Top 分类偏离提示时才展开变体；避免每请求 4 路全扫。
- **`.emb` 按需 pread**：`EmbeddingStore` 不再把整个 `.emb` 读进内存，只保留文件句柄 + 维度；`get()` 用 `fs.readSync` 按偏移读单条向量（配合两阶段，每次仅读候选那几千条）。内存不再随库大小线性膨胀。
- **倒排索引协作式构建**：`buildInvertedIndexAsync` 分批 `setImmediate` 让出事件循环，避免大库构建时冻结整个服务；全库索引由各分类索引按 offset **合并**得到（`mergeInvertedIndexInto`），不重复分词。
- **范围检索**：`search({ categories })` 只加载相关分类（子集缓存 `subsetCache`）。扩写经 `writing-context.ts` 用**已有参考文献 ∪ 用户勾选**反推分类；若仍为空则按题名/方向关键词提示分类（如「绿茶香气」→ 茶学）；范围内 0 命中则自动扩到全库。
- **主题过滤**：检索后按题名/方向主题词过滤跑题片段（`filterChunksByTopicRelevance`）；已有参考文献 pin 保留；过严时 soft top-K 兜底。
- **并发去重**：`categoryLoadInFlight` / `allLoadInFlight` 避免 warmup 与检索并发触发重复构建。
- **Query Embedding LRU**：`getEmbedding` 缓存 `(model,query)→向量`（上限 256），省重复 query 的网络往返。
- **启动预热**：`instrumentation.ts` 后台调 `localRAG.warmup()`。默认 **light**（只加载书目元数据 + 分类列表）；`full` 才预加载全库。
- **全库流式检索**：无分类范围时，逐分类打分再 RRF 融合；默认检索完卸载分类（`RAG_STREAM_CATEGORIES=1`），峰值约等于最大单分类而非全库之和。
- **分类 LRU**：`RAG_CATEGORY_CACHE_MAX`（默认 2）限制常驻分类数；检索中 pin 的分类不会被淘汰。

| 环境变量 | 作用 |
|----------|------|
| `RAG_WARMUP` | `light`（默认）/ `full` / `0`（关闭预热） |
| `RAG_STREAM_CATEGORIES` | `1`（默认）全库逐分类加载并释放；`0` 关闭 |
| `RAG_CATEGORY_CACHE_MAX` | 常驻分类上限，默认 `2`；`0`=不限制 |
| `RAG_PERF_LOG=1` | 每次 `search()` 打一行分段计时（load/bm25/embed/vec/rank/total），生产可见 |

> 排查检索慢：开 `RAG_PERF_LOG=1` 看哪段大——`load` 大=冷启动（确认预热生效/进程是否反复重启）、`embed` 大=embedding API、`vec` 大=候选集过大或回退了全库扫描。

## 索引运维

| 操作 | 入口 |
|------|------|
| 全量重建 | 知识库 UI「重新构建索引」→ `POST /api/knowledge/reindex` SSE |
| 单篇 force | 文献行菜单 → `files` + `forceStage1` / `forceStage3` |
| 二进制迁移 | `npm run rag:convert`（见 [`../DEPLOY.md`](../DEPLOY.md)） |
| Admin 单篇 | `POST /api/admin/knowledge` 后台重索引 |

### Reindex SSE 事件

类型定义：`src/contracts/reindex.ts`。脚本 stdout 前缀 `__INDEX_PROGRESS__`，路由转发为 `data: {...}\n\n`。

| type | 含义 |
|------|------|
| `started` | 任务开始 |
| `scan` | 扫描总数 / 增量跳过数 |
| `file` | 单篇 processing / unchanged / done / error |
| `phase` | pdf_done / writing / embed_skip |
| `save` | 写入某分类 index |
| `embed` | Stage 3 批次进度 |
| `complete` | 成功结束（**必须有**，否则 UI 报「索引流意外结束」） |
| `error` | 失败原因 |

成功后 API 会 `localRAG.reload()` + `invalidateBibCache()`。

## 故障排查

| 现象 | 常见原因 | 处理 |
|------|----------|------|
| 「索引流意外结束」 | Stage 2/3 脚本崩溃，未 emit `complete` | 终端跑 `node scripts/index-pdfs.mjs --progress` 看 stderr；修复后重跑 |
| 全部「未索引 / 0 块」 | 上次索引中断，Prisma 未同步 | 全量「重新构建索引」至 `complete` |
| 单篇 0 块 + parseWarning | 扫描版 PDF，无文本层 | 换 OCR 版或手动填书目 |
| 书目缺字段 | 首页版式特殊 / 无 DOI | `--force-stage1`；有 DOI 时确认未设 `DISABLE_CROSSREF_ENRICH` |
| 仅 BM25 无向量 | 未配置 Embedding Key 或 `--skip-stage3` | 配置 `RAG_EMBEDDING_*` 后全量重建 |
| 换了 Embedding Model 后向量失效 | query 向量维度与 `.emb` 不一致 | 全量重建索引；运行时会打一次 `dim mismatch` 告警 |
| 某目录有 PDF 但分类不出现 / 检索不到 | 同名 PDF 跨分类被 `scanFiles` basename 去重吞掉 | 重建索引看 ⚠ warning 列出的同名跨分类冲突；确认文件权威分类（Prisma `KnowledgeFile.category`） |

## 不变量

- `KnowledgeFile.name` 与磁盘 PDF 文件名一致且唯一
- `chunkCount` 表示 index JSON 块数，不等于 `KnowledgeChunk` 表行数
- 大索引禁止 `readFileSync` 整文件加载（RAG-PR-002+）
- 同名 PDF 出现在多个分类目录时，`scanFiles` 按 basename 去重**只保留首个目录副本**（其余不进索引，重建时打 ⚠ warning 列出冲突）；分类权威源是 Prisma `KnowledgeFile.category`，**不是目录名**——手动移动/复制文件到新目录不会改变分类
- 外部导入 OA PDF（`external-knowledge-ingest.ts`）落盘前会检测跨分类同名：同名同分类复用、跨分类跳过下载，避免制造孤儿目录；增量索引失败时导入结果 `reason: "oa_pdf_index_failed"`
- **知识库页「加入知识库」（2026-08-18）**：`POST /api/knowledge/ingest-external` 不依赖项目；有 OA → 下载+增量索引，有摘要 → 摘要 chunk，否则书目占位。UI：外部检索 Tab「加入知识库」+ 可选分类。
- `listKnowledgeCategories()` 默认过滤「未分类」（UI 分类 Tab / `matchCategoryFromDirection` 用）；`LocalRAG.getCategories()` 传 `true` **纳入「未分类」**，确保 `papers/` 根目录 PDF（`index_未分类.json`）也能进检索
- 外部导入无 PDF 摘要若目标分类已有 `.emb`（含真实 PDF 向量），`appendAbstractChunks` 会重定向到「外部摘要」分类，避免 chunk↔.emb 下标错位
- **外部摘要入库（2026-08-18）**：Agent `import_reference` / `ingest-external` 写入的**无 PDF 摘要 chunk 一律落入 `index_外部摘要.json`**（避免混进烟草等 PDF 分类 `.emb`）。追加时若该分类残留错位 `.emb` 会删掉。
- **自动归类（2026-08-18）**：Prisma `KnowledgeFile.category` 与 chunk `metadata.preferredCategory` 按研究方向 / 题名关键词自动落到实验室分类（烟草、茶学、热化学等）；检索某实验室分类时会并入匹配的外部摘要 chunk（BM25）。
- **历史补建**：
  - 本地 / 开发：`npm run rebuild:external-abstracts`（`--dry-run` / `--all`）
  - **生产**（`data/` 不随部署包上传，须在服务器执行）：
    ```bash
    cd /home/ubuntu/grainscript
    set -a && . ./.env && set +a
    node scripts/rebuild-external-abstracts.cjs --all
    pm2 reload grainscript   # 让 RAG 内存缓存重载
    ```
  - 或 Admin：`POST /api/admin/knowledge/rebuild-external-abstracts` body `{ "all": true }`
- RAG `listKnowledgeCategories` 合并磁盘 `index_*.json`，避免 Prisma 未对齐时检索扫不到。全量重建保留摘要 chunk 时同步把物理分类写回「外部摘要」，并尽量保留 `preferredCategory`。
- **全量重建保留纯摘要**：`index-pdfs.mjs` Stage 2 全量写盘时，会把旧 index 里「source 不在本次 PDF 扫描集合」的纯摘要 chunk 保留下来、统一软落到「外部摘要」分类（`scanFiles` 只扫 PDF，否则全量重建会丢这批外部导入的无 PDF 摘要）
- 运行时 query 向量维度与 `.emb` 不一致（换 Embedding Model 未重建）会打一次性 `dim mismatch` 告警，随后向量检索退化为纯 BM25

## UI

- `src/app/knowledge/page.tsx` — 搜索、分类 Tab、语义/文件名模式
- `knowledge-reindex-progress.tsx` — SSE 进度
- 页头「共 N 篇」与重建索引；勿恢复中间重复状态条（已精简）

## 路线图（Phase 7）

文献库列表书目列、期刊 IF/分区、外部检索与 RIS 导入见 [`plans/ENG-PR-090-knowledge-enrichment.md`](../plans/ENG-PR-090-knowledge-enrichment.md)（ENG-PR-090～094）；队列登记见 [`ENGINEERING_OPTIMIZATION_QUEUE.md`](../ENGINEERING_OPTIMIZATION_QUEUE.md) §1 Phase 7。

### 期刊指标（ENG-PR-091）

| 操作 | 说明 |
|------|------|
| Admin 上传表 | `/admin/knowledge` → `POST /api/admin/journal-metrics`（**CSV / Excel**，列名中英文均可）；成功后写 `JOURNAL_METRICS_LAST_IMPORT`；`GET` 可读最近导入；覆盖率见 `/admin/health` |
| CLI 导入 | `node scripts/import-journal-metrics.mjs [path] [--dry-run]` |
| OpenAlex 篇级 | `node scripts/enrich-knowledge-openalex.mjs [--all]` → `citedByCount`、ISSN、OA |
| OpenAlex 刊级 | `node scripts/enrich-journal-openalex-sources.mjs [--all]` → `oa2yrCitedness`、`hIndex` |
| 索引后自动 | `ENRICH_OPENALEX_AFTER_INDEX=true` 或 `index-pdfs.mjs --enrich-metrics` |

**JCR 影响因子**须来自实验室表（`issn` 或 `journal/刊名` 列 + `影响因子` 等别名）。**OpenAlex 不提供 IF**，仅补被引与 2yr 均值。模板：`data/journal-metrics.example.csv`。
