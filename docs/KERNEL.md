# 技术内核（L4 冷文档）

> 热规则见根目录 [`AGENTS.md`](../AGENTS.md)。本文档放实现细则，避免塞进 AGENTS。

## Next.js 16

- App Router + Turbopack；**勿按旧版 Next 训练数据猜 API**。
- 迁移前读 `node_modules/next/dist/docs/` 中相关指南。
- 认证/限流在 `src/proxy.ts`，由 `src/middleware.ts` 导出 `proxy()`。

## 认证

- JWT（`jose` + `bcryptjs`），HTTP-only cookie。
- 业务 API 通过 proxy 注入 `x-user-id`；Route Handler 读取该 header（见 ENG-PR-001）。
- Admin：`requireAdmin()`，所有 `/api/admin/*` 开头校验。

## API 入参

- 写操作统一 `validateBody(schema, body)`（`@/lib/api-validate`）。
- Schema 定义在 `@/lib/validations`；已接入列表见 [`API_INDEX.md`](./API_INDEX.md)。
- FormData 内 JSON 字段用 `parseOptionalJsonConfig`。

## AI 调用

- 入口：`src/lib/ai.ts` 的 `callAI` / `callAINonStreaming` / `streamAIResponse`。
- Provider 配置：`src/lib/models.ts`（DeepSeek 主写、Zhipu 审查）。
- Prompt 出口：`src/lib/prompts.ts` 及 `src/lib/prompts/*.ts`。
- Admin Key：`SystemSetting` AES 存储，`getApiKeyFromSettings()` 30s TTL。
- 流式接口：`Content-Type: text/event-stream`，事件形状见 `src/contracts/sse.ts`。
- 用量：`usage-log.ts` 内存环（待 ENG-PR-040 持久化）。

## Python 子进程

- 环境变量 `PYTHON_CMD`（禁止硬编码 `python` 路径）。
- 图表：`scripts/charts/` + `registry.json`。
- 典型路由：`/api/chart`、`/api/table`、`/api/xrd/*`、`/api/flow-diagram`、`/api/mol-diagram`。

## 质量闸门

```bash
npm run check    # tsc + vitest + lint
npm run build    # 发布前
```

- pre-commit：至少 `tsc --noEmit`。
- Windows Vitest：`pool=threads`（避免 forks 问题）。

## 环境变量

- 敏感项仅 `.env.local`，勿提交仓库。
- 参考 `.env.example`（ENG-PR-004 待补全）。

## 部署（备忘）

- 仓库：`https://github.com/hyxhhh1013/AI-assisted-writing-system-for-agricultural-research`
- 生产 VPS 与 RAG 迁移步骤见 `DEPLOY.md`、`docs/rag-index-refactor.md`。
