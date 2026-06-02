# 项目规范索引

> **主规范已迁移到分层文档体系**（参考 onion 的 L1～L4）。请以根目录 [`AGENTS.md`](../AGENTS.md) 为唯一热入口。

## 文档地图

| 文档 | 层级 | 内容 |
|------|------|------|
| [`AGENTS.md`](../AGENTS.md) | L1 | 铁律、架构索引、检查清单 |
| [`DOMAIN_INDEX.md`](./DOMAIN_INDEX.md) | L2 | 功能 → 文件/API |
| [`domain/*.md`](./domain/) | L3 | 写作、RAG、图表、审查查重 |
| [`API_INDEX.md`](./API_INDEX.md) | L4 | 路由表 |
| [`DATA_MODEL.md`](./DATA_MODEL.md) | L4 | Prisma 语义 |
| [`KERNEL.md`](./KERNEL.md) | L4 | Next/AI/Python 细则 |
| [`VIBECODING.md`](./VIBECODING.md) | — | AI 任务模板 |

## 仍有效的维护原则（摘要）

- UI 组件单一职责，单文件宜 <200 行（业务组件）。
- API 调用只在 `src/services/`。
- 严禁 `any`；敏感配置不进 Git。
- 复杂业务逻辑注释写清 **Why**。
- 提交前：`npm run check`；pre-commit 跑 `tsc`。
- 改 API 路由后：`npm run docs:api-index`。

## Cursor 规则

见 [`.cursor/rules/`](../.cursor/rules/)：`grainscript-vibecoding.mdc`（始终应用）、`sync-docs.mdc`（改 API/Prisma/Prompt 时同步文档）。
