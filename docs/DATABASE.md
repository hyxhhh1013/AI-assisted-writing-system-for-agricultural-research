# 数据库文档

> 10 个模型、关系总览、字段说明、索引策略、常见查询。
> Schema 文件: `prisma/schema.prisma` | 数据库: PostgreSQL

## 关系总览

```
User (1) ──< (N) Project
Project (1) ──< (N) Section
Project (1) ──< (N) Reference
Project (1) ──< (N) AnalysisResult
Project (1) ──< (N) PlagiarismCheck
Project (1) ──< (N) ReferenceSource
PlagiarismCheck (1) ──< (N) PlagiarismMatch
PlagiarismCheck (1) ──< (N) RewriteSuggestion
PlagiarismMatch (1) ──< (N) RewriteSuggestion (可选)
KnowledgeFile (1) ──< (N) KnowledgeChunk
```

## 表说明

### User — 用户
| 字段 | 类型 | 说明 |
|------|------|------|
| id | cuid | 主键 |
| email | unique | 登录邮箱 |
| name | string | 显示名 |
| password | string | bcrypt 哈希 |
| role | "user"\|"admin" | 角色 |

### Project — 论文项目
| 字段 | 类型 | 说明 |
|------|------|------|
| id | cuid | 主键 |
| title | string | 论文标题 |
| userId | FK→User | 归属用户，级联删除 |
| template | "sci"\|"ieee"\|"gbt7713"\|"nature" | 期刊模板 |
| mode | "review"\|"research" | 写作模式（文献综述/研究论文） |
| outline | string? | 大纲 JSON |
| charts | string? | 图表元数据 JSON |
| dataClaims | string? | EvidenceClaim[] JSON |
| dataSources | string? | DataSourceAnalysis[] JSON |

注意：`charts`/`dataClaims`/`dataSources` 目前仍以 JSON 字符串保存，读写时需要 `JSON.parse/stringify`。这是为兼容已有数据结构与前后端契约，不代表数据库仍是 SQLite。

### Section — 章节
| 字段 | 类型 | 说明 |
|------|------|------|
| key | "introduction"\|"methods"\|"results"\|"conclusion" | 章节标识 |
| content | string | Markdown 内容 |
| projectId | FK→Project | 级联删除 |

一个项目每个 key 只能有一条记录 (`@@unique([projectId, key])`)。

### Reference — 参考文献
| 字段 | 类型 | 说明 |
|------|------|------|
| content | string | 引用文本 |
| order | int | 排序编号 |
| projectId | FK→Project | 级联删除 |

索引: `[projectId, order]` 支持按顺序查询。

### AnalysisResult — AI 分析结果
| 字段 | 类型 | 说明 |
|------|------|------|
| content | string | 分析结果文本 |
| projectId | FK→Project | 级联删除 |

### KnowledgeFile — 知识库文件
| 字段 | 类型 | 说明 |
|------|------|------|
| name | unique | 文件名（唯一） |
| category | string | 分类标签 |
| documentType | "paper"\|"patent"\|"other" | 文档类型 |
| size | int | 文件大小 (bytes) |
| mtime | datetime | 文件修改时间 |
| chunkCount | int | RAG 索引块数量（与 `data/index_*.json` 同步） |
| bib | string? | 书目 JSON |
| gbTag | string? | GB/T 文献类型标识 |
| parseWarning | string? | PDF 解析警告 |
| bibEdited | bool | 用户是否手动校正书目 |

**主数据源**：Prisma `KnowledgeFile`（API 读写、RAG 书目缓存均走 DB）。

`data/metadata.json` 已 **deprecated**（仅迁移脚本或 `USE_METADATA_JSON_FALLBACK=true` 时只读回退）。索引构建由 `scripts/index-pdfs.mjs` 在 Stage 2 结束后调用 `scripts/sync-knowledge-metadata-to-prisma.mjs` 写入 Prisma。

与文件系统同步，删除文件时需同步删除数据库记录。

### KnowledgeChunk — 知识库分块
| 字段 | 类型 | 说明 |
|------|------|------|
| content | string | 分块文本 |
| embedding | string? | 向量 JSON（如启用） |
| fileId | FK→KnowledgeFile | 级联删除 |

索引: `[fileId]` 支持按文件查询所有分块。

### PlagiarismCheck — 查重会话
| 字段 | 类型 | 说明 |
|------|------|------|
| projectId | FK→Project? | 可选关联项目 |
| status | "pending"\|"processing"\|"completed"\|"failed" | 处理状态 |
| maxSimilarity | float | 最高相似度 |
| overallRisk | "high"\|"medium"\|"low" | 总体风险等级 |

### PlagiarismMatch — 匹配结果
| 字段 | 类型 | 说明 |
|------|------|------|
| checkId | FK→PlagiarismCheck | 所属检测，级联删除 |
| matchType | "local"\|"web"\|"cross" | 匹配来源类型 |
| similarity | float | 相似度 0-1 |
| riskLevel | "high"\|"medium"\|"low" | 风险等级 |
| matchedFrom | string | 来源名称 |

### RewriteSuggestion — 降重建议
| 字段 | 类型 | 说明 |
|------|------|------|
| checkId | FK→PlagiarismCheck | 所属检测，级联删除 |
| matchId | FK→PlagiarismMatch? | 可选关联匹配 |
| strategy | "synonym"\|"rephrase"\|"summarize"\|"expand" | 改写策略 |
| status | "pending"\|"accepted"\|"rejected" | 采纳状态 |

### ReferenceSource — 引用-文献映射
| 字段 | 类型 | 说明 |
|------|------|------|
| projectId | FK→Project | 级联删除 |
| refIndex | int | 正文引用编号 [1], [2]... |
| sourceName | string | RAG 源文件名 |
| category | string | 文献分类 |
| citation | string | 格式化引用文字 |

唯一约束: `[projectId, refIndex]` — 每个项目内引用编号唯一。

## 索引策略

| 表 | 已有索引 | 说明 |
|----|---------|------|
| User | email (unique) | 登录查询 |
| Project | userId | 查用户所有项目 |
| Section | [projectId, key] (unique) | 查项目某章节 |
| Reference | [projectId, order] | 按顺序查引用 |
| KnowledgeChunk | fileId | 查文件所有分块 |
| PlagiarismCheck | projectId | 查项目查重历史 |
| PlagiarismMatch | checkId | 查检测所有匹配 |
| ReferenceSource | projectId + [projectId, refIndex] (unique) | 查项目引用映射 |

**已补**（ENG-PR-053）：`AnalysisResult(projectId)`、`KnowledgeFile(category)`；`RewriteSuggestion(checkId)` 此前已有。

## 常见查询

```typescript
// 查用户所有项目
prisma.project.findMany({ where: { userId }, include: { sections: true } })

// 查项目某章节
prisma.section.findUnique({ where: { projectId_key: { projectId, key } } })

// 查项目全部引用（按顺序）
prisma.reference.findMany({ where: { projectId }, orderBy: { order: 'asc' } })

// 查用户某项目（鉴权）
prisma.project.findFirst({ where: { id: projectId, userId } })

// 查项目查重历史
prisma.plagiarismCheck.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } })

// 查文件所有分块
prisma.knowledgeChunk.findMany({ where: { fileId } })

// 按分类统计知识库
prisma.knowledgeFile.groupBy({ by: ['category'], _count: true })
```

## 迁移注意事项

- 开发环境: `docker compose up -d db` 启动 PostgreSQL 后运行 `npx prisma db push`
- 生产环境: `npx prisma migrate deploy`（执行已有迁移）
- 修改 schema 后运行 `npx prisma generate`，确保 `@prisma/client` 类型同步
- `.env.example` 面向本地开发使用 `localhost:5432`；Docker app 容器内使用 `db:5432`
