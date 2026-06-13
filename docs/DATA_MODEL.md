# 数据模型（L4）

> 权威定义：`prisma/schema.prisma`。改表后**先迁移再更新本文**。

## 核心实体关系

```text
User 1──* Project 1──* Section
                    ├──* Reference
                    ├──* AnalysisResult
                    ├──* PlagiarismCheck
                    └──* ReferenceSource

KnowledgeFile 1──* KnowledgeChunk
```

## 写作项目（Project）

| 字段 | 说明 |
|------|------|
| `template` | `sci` \| `ieee` \| `gbt7713` \| `nature` |
| `mode` | `review` \| `research`（证据包口径） |
| `citationStyle` | `gbt7714` \| `vancouver` \| `apa7` \| `ieee` |
| `charts` | JSON 字符串，图表元数据 |
| `dataClaims` | JSON `EvidenceClaim[]` |
| `dataSources` | JSON `DataSourceAnalysis[]` |
| `expandedOutlineSections` | JSON `string[]`，大纲扩写已完成任务 id（`stableHash(fullPath)`）；整章扩写时同 `sectionKey` 下子节一并标记 |

**保存策略（当前）**

- `Section`：按 key **增量 PATCH** `/api/projects/[id]/sections/[key]`
- `Reference`：**增量 PATCH** `/api/projects/[id]/references`（含 `replace`）
- `AnalysisResult`：**增量 PATCH** `/api/projects/[id]/analysis-results`
- `expandedOutlineSections`：随项目 **POST** `/api/projects` 写入（JSON 列）；自动保存/手动保存均走此路径
- 禁止前端 `saveProject` 全量覆盖 refs/analysis（已迁移，见 ENG-PR-025b）

## 知识库（KnowledgeFile）

| 字段 | 说明 |
|------|------|
| `name` | 与 `data/pdfs/` 文件名唯一对应 |
| `documentType` | `paper` \| `patent` \| `other` |
| `bib` | JSON 书目信息（含 `issn` / `eissn` / `doi` 等，见 `contracts/knowledge.ts`） |
| `metrics` | JSON 期刊指标（ENG-PR-091：`impactFactor`、`jcrQuartile`、`citedByCount`、`oa2yrCitedness`、`hIndex` 等） |
| `chunkCount` | RAG `index_*.json` 块数（非 Chunk 表行数） |

**数据源真相**

- 书目与分类：**Prisma `KnowledgeFile`**（ENG-PR-027/028）
- RAG 向量/BM25：`data/index_*.json` + `.emb`（见 [`domain/rag-and-knowledge.md`](./domain/rag-and-knowledge.md)）
- `data/metadata.json`：仅过渡 fallback（`USE_METADATA_JSON_FALLBACK`），新写入已停

## 审查与查重

| 模型 | 用途 |
|------|------|
| `ReviewCheck` | 四维度审查报告（JSON 存 `content` / 维度分） |
| `PlagiarismCheck` | 查重会话（`status`、`maxSimilarity`、`overallRisk`） |
| `PlagiarismMatch` | 单条匹配（`matchType`: local / web / cross） |
| `RewriteSuggestion` | 降重建议（`strategy`、`status`） |

业务说明：[`domain/review-plagiarism.md`](./domain/review-plagiarism.md)。

## 系统与质量

| 模型 | 用途 |
|------|------|
| `SystemSetting` | Admin 加密 API Key 等 |

## 索引（待 ENG-PR-053）

队列计划为高频查询补 `@@index`；改 schema 时同步本节。
