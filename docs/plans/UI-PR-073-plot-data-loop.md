# UI-PR-073 — 作图板块数据闭环与增量插入

> 状态：P0～P2 + 写作编辑入口 done（待手动验收）  
> 分支：`ui/pr-073-plot-data-loop`  
> 依赖：UI-PR-072（Project.charts 契约，此前标记 done 但未落地）

## 目标

打通 **实验数据 → 推荐图表 → /plot 预填 → 增量插入章节 + charts 资产登记** 主链路；修复 `PlotInsertDialog` 全量 `projectStore.save` 违反增量 PATCH 规范的问题。

## 范围

| 在范围内 | 不在范围内 |
|---------|-----------|
| `ProjectChartAsset` 契约 + PATCH `/api/projects/:id/charts` | 工作台内嵌 ChartPanel |
| `patchProjectSection` / `appendChartAsset` service | Python 子进程跨请求缓存 |
| 分析结果持久化 `chartConfigs`（写入 `dataSources` JSON） | flow/XRD 面板从 URL JSON 预填（后续） |
| URL 深链 `/plot?id=&figure=&chartIdx=&figureSpec=` | Python 子进程跨请求缓存 |
| 写作 FIGURE → 绘图页编辑入口 | XRD 从 URL 预填表单 |
| `PlotInsertDialog` 增量插入 + 自动图号 | — |
| P1：示例、解析提示、预览、样式预设 | — |
| P2：registry panel 映射、FIGURE 深链、生成进度 | — |

## 数据流

```text
上传 CSV → analyzeData → dataSources[].chartConfigs 持久化
  → Evidence「推荐图表」→ buildPlotPageHref
  → useChartPanel 预填 paste + 标题/轴标签
  → 生成图（分阶段进度文案）→ PlotInsertDialog（图 N 题注）
  → PATCH sections/[key] + PATCH charts
```

FIGURE 标记 → `figureBlockJsonToPlotHref` → `/plot?figureSpec=…` → 同 chart 预填链路。

## 实现清单

### P0–P1

见 git 历史；核心：`contracts/figure.ts`、`PATCH charts`、`PlotInsertDialog`、`use-chart-panel` P1。

### P2

- [x] `plot-figure-panel.tsx`：registry id → ChartPanel / Table / XRD / 示意图
- [x] `plot-page-client.tsx` 瘦身，读 `figureSpec` URL 参数
- [x] `buildPlotPageHref` / `figureBlockJsonToPlotHref` / `encodeFigureSpecParam`
- [x] 生成进度：`generateStage`（提交数据 → Python 绘图）
- [x] Evidence 深链改用 `buildPlotPageHref`

### P2（续）— 写作编辑 + flow 预填

- [x] `WritingFigureEditLinks`：扩写结果 / 工作台编辑器 / AI 预览侧栏
- [x] 配图生成失败时 Markdown 追加 `[在绘图页编辑](...)`
- [x] `figureSpecToFlowPrefill` + FlowCard 预填节点/连线
- [x] `detectedFigureToPlotHref` / `collectWritingFigureEditItems`

### 验证

- [x] `npx tsc --noEmit`
- [x] `npx vitest run` chart-prefill + project-charts-patch

## Test plan

1. Evidence → plot 预填 → 生成 → 插入（图 N 题注）
2. `figureBlockJsonToPlotHref` 生成的 URL 打开后数据/标题已填
3. 生成时预览区显示「正在提交数据…」「正在运行 Python 绘图…」
4. 切换 registry 各类图形（chart/table/xrd/flow）面板正常渲染
