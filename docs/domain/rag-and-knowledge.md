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

- `localRAG`：BM25 + 余弦相似度，RRF 融合
- `getBibMap` / `getCategories` / `search` 走 Prisma 缓存
- 写作上下文：`services/writing-context.ts` 组装 `contextText` + `refMapping`

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

## 不变量

- `KnowledgeFile.name` 与磁盘 PDF 文件名一致且唯一
- `chunkCount` 表示 index JSON 块数，不等于 `KnowledgeChunk` 表行数
- 大索引禁止 `readFileSync` 整文件加载（RAG-PR-002+）

## UI

- `src/app/knowledge/page.tsx` — 搜索、分类 Tab、语义/文件名模式
- `knowledge-reindex-progress.tsx` — SSE 进度
- 页头「共 N 篇」与重建索引；勿恢复中间重复状态条（已精简）

## 路线图（Phase 7）

文献库列表书目列、期刊 IF/分区、外部检索与 RIS 导入见 [`plans/ENG-PR-090-knowledge-enrichment.md`](../plans/ENG-PR-090-knowledge-enrichment.md)（ENG-PR-090～094）；队列登记见 [`ENGINEERING_OPTIMIZATION_QUEUE.md`](../ENGINEERING_OPTIMIZATION_QUEUE.md) §1 Phase 7。
