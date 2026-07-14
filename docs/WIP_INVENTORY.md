# 工作区未提交改动清单（2026-07-14）

> 分支：`eng/pr-092-external-literature-search`（已 ahead origin 37，且另有大量未提交）。  
> **用途**：收拢时按主题拆 commit；本文件非战略主轴，收拢后可删。

## A — 文档收拢（本轮已改）

- `docs/MASTER_PLAN.md`
- `docs/ENGINEERING_OPTIMIZATION_QUEUE.md`
- `docs/DOMAIN_INDEX.md`
- `docs/API_INDEX.md`（工作区可能另有自动刷新）
- `src/app/writing/page.tsx` → 重定向
- `src/app/analysis/page.tsx` → 重定向

## B — Wave 2 Agent（建议单独 commit）

- `src/lib/agent/langgraph/**`
- `src/lib/agent/tools/**`（write/refine/chart/import…）
- `src/lib/agent/writing-runner.ts`、`writing-sections.ts`、`project-loader.ts`、`project-persist.ts`…
- `src/lib/agent/core/agent-loop.ts`、`safety.ts`、`prompts.ts`
- `src/app/api/agent/route.ts`
- 测试：`agent-langgraph.test.ts`、`agent-tools-wave2.test.ts`、`agent-writing-sections.test.ts`、`agent-safety.test.ts`

## C — Direction 文献 / handoff（建议单独 commit）

- `src/contracts/direction-literature.ts`、`direction-writing-bridge.ts`、`direction.ts`
- `src/lib/direction-literature-corpus.ts`、`direction-roadmap-match.ts`、`direction-writing-bridge.ts`…
- `src/app/api/directions/**`（含 `literature-corpus/`）
- `src/components/shared/direction/**`（corpus、handoff、roadmap dialog…）
- `src/services/direction*.ts`、`project-handoff.ts`
- 测试：`direction-literature-corpus.test.ts`、`direction-roadmap-match.test.ts`

## D — Project / Cockpit 增量（建议单独 commit）

- `src/components/shared/project/**`（handoff banner、reference import、knowledge picker、cockpit、paper-config）
- `src/lib/paper-passport-*.ts`
- `src/components/shared/create-project-wizard.tsx`
- `src/app/workbench/workbench-page-client.tsx`、`workbench-tab-switcher.tsx`
- `src/app/projects/projects-page-client.tsx`
- `src/services/project.ts`、`prisma/schema.prisma`（若仅 passport/相关字段）

## E — 其它零散

- `src/app/api/chart/route.ts`、`src/lib/chart-runner.ts`、`src/lib/agent/chart-persist.ts`
- `src/components/shared/knowledge/knowledge-external-search.tsx`
- `src/components/shared/reader-panel.tsx`、`reference-browser.tsx`
- `package.json`（LangGraph 等依赖）
- `docs/reports/*` 周报/日志（可另 commit `docs:`）

## 建议 commit 顺序

1. `docs: 收拢 MASTER_PLAN / 队列 / DOMAIN_INDEX + 废弃页重定向`
2. `feat(agent): LangGraph + write tools (W2)`
3. `feat(direction): literature corpus + handoff`
4. `feat(passport): cockpit / project handoff 增量`
5. 零散 + reports

合入前：`npm run check`；考虑 rebase/merge 到 `main` 后废弃超长 `pr-092` 分支名。
