# 知识库与 RAG（L3 业务）

> 性能重构清单：[`../rag-index-refactor.md`](../rag-index-refactor.md)。

## 数据流

```text
PDF 文件 (data/pdfs/)
    → index-pdfs.mjs（分块 + 向量）
    → data/index_*.json + .emb
    → Prisma KnowledgeFile / KnowledgeChunk（元数据 + 可选块）
    → lib/rag.ts（BM25 + 向量 RRF）
    → /api/chat、writing 检索、outline 等
```

## 书目元数据（ENG-PR-027/028 后）

- **读**：`src/lib/knowledge-metadata.ts` → Prisma `KnowledgeFile`
- **写**：`POST /api/knowledge` 不再写 `data/metadata.json`
- **索引后同步**：`scripts/sync-knowledge-metadata-to-prisma.mjs`
- **Fallback**：`USE_METADATA_JSON_FALLBACK=true` 时才读旧 `metadata.json`

## RAG 引擎要点

- `localRAG`：BM25 + 余弦相似度，RRF 融合
- `getBibMap` / `getCategories` / `search` 走 Prisma 缓存
- 写作上下文：`services/writing-context.ts` 组装 `contextText` + `refMapping`

## 索引运维

| 操作 | 入口 |
|------|------|
| 全量重建 | 知识库 UI「重新构建索引」→ `/api/knowledge/reindex` |
| 二进制索引 | `npm run rag:convert` 等（见 package.json scripts） |
| Admin 单篇 | `/api/admin/knowledge` |

## 不变量

- `KnowledgeFile.name` 与磁盘 PDF 文件名一致且唯一
- `chunkCount` 表示 index JSON 块数，不等于 `KnowledgeChunk` 行数
- 大索引禁止 `readFileSync` 整文件加载（RAG-PR-002+）

## UI

- `src/app/knowledge/page.tsx` — 搜索、分类 Tab、语义/文件名模式
- 页头保留「共 N 篇」与重建索引；勿恢复中间重复状态条（已精简）
