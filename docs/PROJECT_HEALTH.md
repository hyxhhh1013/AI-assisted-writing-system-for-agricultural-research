# 项目健康检查

> 最近检查日期：2026-06-01  
> 目标：记录当前阻断项，避免后续开发误判项目状态。  
> **工程修复队列**：[`docs/ENGINEERING_OPTIMIZATION_QUEUE.md`](./ENGINEERING_OPTIMIZATION_QUEUE.md)（ENG-PR-001 起）

## 验证结果

| 命令 | 结果 | 备注 |
|------|------|------|
| `npm run test` | **通过** | 19 个测试文件（含 proxy-auth、safe-path）；2026-06-01 |
| `npx prisma validate` | 通过 | `prisma/schema.prisma` 为 PostgreSQL |
| `npx tsc --noEmit` | **通过** | 2026-06-01 本地 0 error |
| `npm run lint:src --quiet` | **通过** | 0 error；293 warn（`no-console` / `no-explicit-any` 等，非门禁） |
| `npm run build` | **通过** | 2026-06-01 本地 `next build` 成功 |
| `npm run check` | **通过** | typecheck + test + lint:src（2026-06-01） |

复验命令：

```bash
npx tsc --noEmit
npm run lint:src --quiet
npm run test
npm run build
npm run check
```

## 优先修复项（下一阶段）

### P0：RAG 巨型索引阻塞 → RAG-PR-001～005

见 [`docs/rag-index-refactor.md`](./rag-index-refactor.md)。`data/index_*.json` 合计约 1.88GB，同步 `readFileSync` 可导致对话 API 卡死或 OOM。

### P1：认证代理头 → ENG-PR-001（已完成）

`x-user-id` 已通过 `NextResponse.next({ request: { headers } })` 注入 request。

### P1：文件路径安全 → ENG-PR-003（已完成）

`src/lib/safe-path.ts` + knowledge/pdf API。

### P2：React Compiler hooks 规则（存量）

`react-hooks/set-state-in-effect` / `refs` 在 ESLint 中设为 `off`，避免单次改 40+ 客户端页面；后续可按页面逐步改为 fetch-in-effect 无同步 setState 模式。

### P2：Lint warn 清零 → ENG-PR-054

`no-console`、`no-explicit-any` 等约 293 条 warning，不阻断 `npm run check`。

## 已过时条目（勿再作为默认任务）

- 2026-05-31 JSX 结构损坏（outline/writing/data-panel）— 当前 `tsc` 已通过
- `next/font/google` 构建失败 — 2026-06-01 build 已通过（系统字体栈）

## 修复后复验顺序

1. `npm run typecheck`
2. `npm run lint:src --quiet`
3. `npm run test`
4. `npm run build`
