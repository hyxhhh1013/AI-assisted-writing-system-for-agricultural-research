@AGENTS.md

## Vibecoding 规范

每次做功能按这个模板：

```
目标：只实现 xxx 功能。

禁止：
- 不要改 workbench/page.tsx，除非只是接入现有 hook
- 不要直接 fetch()——用 services/ 封装
- 不要全量保存 Project——用增量 PATCH
- 不要使用 any
- 不要改 backup_*

先做：rg 搜索相关引用，列出影响范围。

实现顺序：
1. src/contracts/     — 新增/修改类型
2. src/services/      — 新增/修改 service 或 API
3. src/hooks/         — 新增/修改 hook
4. src/components/    — 新增/修改组件

验证：
  npx tsc --noEmit && npm run test

交付：说明数据流 UI → service → API → DB/AI → UI
```

## 当前工程状态 (2026-05-24)

### 架构 v2 重构完成（2026-05-15 ~ 2026-05-16）

**契约层**：`src/contracts/` — SSE/Writing/Project/Figure/DataSource/Consistency 类型，前后端共享
**保存模型**：sections 增量 upsert；references/analysisResults 仍全量覆盖（待 P2-1 补增量 PATCH）
**SSE 统一**：/api/writing 全部 20+ 排放点改为 `{type, ...}` 格式，前端用类型守卫解析
**Python 路径**：8 路由从硬编码改为 `process.env.PYTHON_CMD`
**middleware → proxy**：中间件已迁移为 `src/proxy.ts`（Next.js 16 App Router 兼容），`proxy()` 从 `src/middleware.ts` 导出
**质量闸门**：`npm run check`（typecheck + test + lint）、`.gitignore`、`empty.js`

**关键文件当前行数**：
| 文件 | 当前行数 | 备注 |
|------|----------|------|
| workbench/page.tsx | 776 | 已从 1200+ 拆到 776 |
| writing-panel.tsx | 826 | 仍偏大，待 P3-3 继续拆 |
| /api/writing/route.ts | 436 | 五阶段流水线，待 P3-3 拆 |
| sci-preview.tsx | 153 | 已精简 |

**TypeScript**：0 errors | **Dev server**：零警告启动

### 已完成事项

- [x] useFigurePipeline 接入 WritingPanel（`findFigureBlocks / generateSingleFigure / replacePlaceholders`）
- [x] 扩写流程（Writer→Verifier→Refiner→引用修正）正常运行
- [x] ESLint `no-console: warn` 已启用（2026-05-24）
- [x] `src/services/writing.ts` 已删除（死代码）
- [x] `scripts/misc/` 整理了无关的 gen-*.mjs 脚本

### UI 补全 PR 队列（跨会话接力）

- **任务单**：[`docs/UI_COMPLETION_QUEUE.md`](docs/UI_COMPLETION_QUEUE.md) — 按 `UI-PR-001…` 编号，含 Vibecoding 模板、依赖图、状态表
- **开干前**：读队列 §0 接力协议 → 找第一个 `todo` 且依赖已 `done` 的 PR
- **完成后**：更新总表状态 + §4 会话日志

### 待处理技术债（改进计划）

| 优先级 | 编号 | 说明 |
|--------|------|------|
| P1 | p1-1 | `@typescript-eslint/no-explicit-any: warn` + 修 shared.tsx 13 个 any |
| P1 | p1-2 | 8 个 zod schema 接入对应 API 路由 validateBody |
| P1 | p1-3 | 组件层直接 fetch() 迁移到 services/（9 处） |
| P2 | p2-1 | references/analysisResults 改增量 PATCH |
| P2 | p2-3 | 统一 ProjectData 类型（以 contracts/project.ts 为准） |
| P3 | p3-1 | Prisma 补 3 条 @@index |
| P3 | p3-2 | lib/utils.ts 8 个核心函数补单测 |
| P3 | p3-3 | 拆 writing-panel.tsx + api/writing/route.ts |
| P3 | p3-4 | 统一 logger 封装 |
| P3 | p3-5 | 补 .env.example + pre-commit hook |

### Prompt 系统
- 所有 AI prompt 已注入 nature-polishing 学术写作原则（Section move order、Evidence strength 分级、Results/Discussion 分离、Overclaim 防护、Limitation 要求）
- 5 个 prompt 文件：`writing.ts`、`outline.ts`、`analysis.ts`、`consistency.ts`、`domain.ts`
- Verifier 现在也检查 overclaim 和句式混淆，不只查引用
- 农业领域适配：术语适配、田间/温室试验惯例、GB/T 7713 + SCI 双轨

### 图形生成系统（统一注册表架构）
- **唯一真相源**：`scripts/charts/registry.json` — 15 种图形，4 个分类
  - 数据图表 6 种（分组柱状/堆积/百分比堆积/折线/散点/饼）
  - 示意图 2 种（流程图/机理图、分子结构图）
  - XRD 分析 6 种 + 三线表 1 种
- **加新图表**：`chart_types/` 下写 1 个 Python 文件 + registry.json 加 1 条记录，前端自动出现
- **基类**：`scripts/charts/chart_base.py` — ChartModule，自动扫描 `chart_types/` 加载
- **API**：`GET /api/figures/registry` 返回注册表，前端动态渲染
- **前端入口**：`/plot` 页面 + workbench 侧边栏倒数第二个按钮
- **三线表**：`POST /api/table` — GB/T 7714 规范，含字母上标 + ANOVA 文字生成

### Workbench 状态
- `page.tsx` 已从 1206 行拆到 839 行
- 已提取 hooks：`useDocxExport`、`useReferenceReorder`、`useProjectLoader`、`useEditorSync`、`useAutoSave`、`useMarkdownExport`、`usePdfExport`

### 基础设施
- Vitest 测试框架：6 文件 45 测试，pool=threads（Windows forks 兼容）
- feature-flags.ts：14 个功能的环境变量开关
- usage-log.ts：内存使用日志（已接入所有 AI route）
- 知识库：KnowledgeFile 支持 documentType（paper/patent/other）

### 部署
- GitHub：`https://github.com/hyxhhh1013/AI-assisted-writing-system-for-agricultural-research`
- VPS：42.194.162.51（详见 memory）
