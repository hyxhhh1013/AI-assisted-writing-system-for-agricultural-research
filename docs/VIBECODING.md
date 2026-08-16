# Vibecoding 工作流（GrainScript）

> 每次让 AI 实现功能时，在任务描述中附带本模板，或引用 `@docs/VIBECODING.md`。

## 标准任务模板

```
目标：只实现 xxx 功能。

禁止：
- 不要改 workbench/page.tsx，除非只是接入现有 hook
- 不要直接 fetch()——用 services/ 封装
- 不要全量保存 Project——用增量 PATCH（sections / references / analysis-results）
- 不要使用 any
- 不要改 backup_*

先做：rg 搜索相关引用，列出影响范围。

实现顺序：
1. src/contracts/     — 新增/修改类型
2. src/services/      — 新增/修改 service 或 API
3. src/hooks/         — 新增/修改 hook
4. src/components/    — 新增/修改组件

验证：
  npm run check
  （或 npx tsc --noEmit && npx vitest run）

若新增/修改 API 路由：
  npm run docs:api-index

交付：说明数据流 UI → service → API → DB/AI → UI
```

## 大文件策略

以下文件**禁止继续堆逻辑**，新代码进 hooks / 子组件 / `pipeline/`：

| 文件 | 策略 |
|------|------|
| `src/app/workbench/page.tsx` | 只接 hook，不新增业务逻辑 |
| `src/components/shared/writing-panel.tsx` | 拆到 `writing/` 子组件 + hooks（ENG-PR-031） |
| `src/app/api/writing/route.ts` | 已拆 pipeline；route 只做编排 |
| `src/lib/agent/core/agent-loop.ts` | 只编排；工具挂 `src/lib/agent/tools/registry.ts`（W3-AP-ARCH-01） |

## 跨会话接力

| 队列 | 用途 |
|------|------|
| [`UI_COMPLETION_QUEUE.md`](./UI_COMPLETION_QUEUE.md) | UI-PR-001… 界面补全 |
| [`ENGINEERING_OPTIMIZATION_QUEUE.md`](./ENGINEERING_OPTIMIZATION_QUEUE.md) | ENG-PR / RAG-PR 工程债 |

开干前：读队列 §0 → 找第一个 `todo` 且依赖已 `done` 的 PR。  
完成后：更新总表 + §4 会话日志。
