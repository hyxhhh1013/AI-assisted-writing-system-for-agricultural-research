# 图表与 Python 子进程（L3 业务）

## S2 逐类提质（2026-08-06 起）

**通用**：`config.significance` 标注显著性（星号/括号，自动避让、含误差上沿）；误差棒数据列后缀 `_sd/_se/_ci` 自动渲染；agent 经 `generate_chart(configJson={...})` 传入。

**进度（数据图 11/11 ✅ 全部完成）**：

| 类型 | 已加 |
|------|------|
| bar_grouped | 显著性（单柱星号/跨类括号）+ 误差棒 + 数值 |
| bar_stacked | 顶部总误差棒 + 显著性 + 总数标注 |
| bar_pct_stacked | 段内百分比 + 顶部显著性 |
| line | 显著性点标 + x 区间括号（+已有误差棒/阴影带/拟合/双Y） |
| scatter | 线性拟合 R² 角注 + 多系列标记 |
| pie | 环形(donut) + 图例模式（多扇区） |
| heatmap | 发散配色（相关矩阵 0 居中）+ 标注格式 + 单元格网格线 |
| area | 顶线误差带（show_shadow）+ 标记 |
| forest | 右侧估计值标注（est [lo, hi]） |
| radar | 逐系列标记 |
| stack_offset | 右侧谱线标签（Origin 惯例） |

**冒烟审计（2026-08-06，19 个特化类型）**：
- ✅ 全部 14 个 `chart_types` 模块 + flow_diagram / xrd_peakfit / xrd_scherrer / xrd_bragg（需 `crystal_system` 等配置）
- ❌ **xrd_xps / xrd_amorphous 不可用**：PyXplore 2026.3.20 + numpy 2.x 不兼容（`only 0-dimensional arrays can be converted to Python scalars`）。
  **已确认两条修复路都被 Python 3.14 生态卡死**：① numpy 1.x 无 py3.14 wheel；② PyXplore 新版需 mesonpy 构建后端（mesonpy 无 py3.14 发行版）。
  **决策（2026-08-06）：接受现状**，待 PyXplore 出 py3.14 兼容版或图表环境换 py3.12 再解。

**基座修复**：`plot_style.resolve_style` 顶层 config 字段（show_values/bar_edge 等）未落进 style 的 bug，全类型受益。

## 注册表（唯一真相源）

- `scripts/charts/registry.json` — **v2.2**，5 类（数据图 / 示意 / XRD·Jade / DFT / 表格）
- 新增图表：`chart_types/*.py` + registry 一条 → 前端 `/plot` 自动出现
- API：`GET /api/figures/registry`

## 分类

| 类 | 示例 | 靠拢 |
|----|------|------|
| 数据图 | 柱状/堆积/折线（双 Y·拟合）/散点/饼/热力/面积/森林/雷达/**offset 堆叠谱** | Origin |
| 示意图 | 流程图、分子结构 | — |
| XRD | peakfit、bragg、amorphous、simulate、XPS、**多谱叠加**、**Scherrer** | Jade |
| DFT | **能带**、**DOS/PDOS**（CSV 先行） | DFT 后处理 |
| 表格 | 三线表 GB/T 7714 | — |

## 调用约定

- 环境变量 **`PYTHON_CMD`**（所有 Python 路由已统一）
- 基类：`scripts/charts/chart_base.py`（`ChartModule` 自动扫描）
- 期刊样式：`scripts/charts/plot_style.py`（对照 plotstyle/SciencePlots：**栏宽 mm、字号、PDF fonttype 42、validate、默认 png+svg+pdf**；不引入外部包）
- 预设：`nature` / `agr_journal` / `agr_cn` / `ieee` / `acs` / `elsevier` / `print_bw` / `slide`
- 色板：`nature` / `agr` / **`biomass`（原料→催化→产物语义）** / `bright`·`tol`（色盲） / `print_bw`；可选 **系列标记** 灰度可辨
- 校验含灰度相邻对比提示；多子图可用 `create_subplots()` 自动 (a)(b)(c)
- 样式字段：`registry.json` → `global_style_fields`（含 `columns` 1/2 栏、`print_bw`、TIFF）
- 出图后 API 可回传 `styleValidation`（宽/字号/DPI/线宽/灰度提示）
- 工作台：`useFigurePipeline` — `findFigureBlocks` / `generateSingleFigure` / `replacePlaceholders`
- 规划队列：[`docs/plans/FIG-PR-scientific-plotting.md`](../plans/FIG-PR-scientific-plotting.md)

## 示意图 / 机理图（期刊向）

| 路径 | 用途 |
|------|------|
| `POST /api/flow-diagram` | Graphviz 期刊流程（preset + PNG/SVG/PDF） |
| `POST /api/mechanism-panel` | 多面板 a/b/c 合成（text/image/flow/callout） |
| `/plot` → 流程图 / Mermaid / 多面板机理图 | 统一入口 |

- 流程预设：`nature` / `agr_journal` / `print_bw`；边标签、节点角色（process/decision/start_end）
- UI：`flow-canvas.tsx` 轻量可拖拽编排；**Mermaid/DOT 导入导出**（`flow-diagram-io.ts`，对照 Kroki 多引擎思路、无服务依赖）
- **示意图宽编辑栏（2026-08-10）**：多面板/流程/Mermaid 使用 `PlotWorkspace configSize="wide"`（左侧约半屏编辑整块）；绘图页类型栏收窄为 `w-40`，把宽度留给编辑区
- 终稿渲染（`flow_diagram_v2.py`）：**禁止 ratio=compress**；白底细线 + 左侧色条 HTML 节点；有边标签时用 polyline；400dpi 后按栏宽等比缩放
- 农科模板：生物质热解路径、双路径产物等
- 多面板：优先每栏 `flow_subgraph`（中文 steps）；有真实素材时才挂 image。**Agent 默认不再输出「Upload figure asset」空占位**
- Agent 三层定位：
  1. **草稿**：`draft_mechanism_figure` / `generate_chart`（可 `templateId` 农科模板）→ PNG 入库
  2. **硬闭环**：出图后系统自动 `read_figure(qa)`（两级：`需重生成` / `可接受·建议精修` / `可接受`）；硬伤必须 `replaceImageUrl`；建议精修不强制重画、引导 `/plot`；同标题防叠图自动 replace；`remove_figure` 清旧图
  3. **个性化（Agent 表单为主）**：输入框上方**配图坞**随时「按意见改」；表单快捷项（分叉/三面板/模板）→ `replaceImageUrl` 重画；复杂观感进 `/plot?replaceImageUrl=`，插入对话框默认**就地替换**正文旧图。**插图位置**：默认节末落盘，编辑器「本节插图」条可挪位（不做智能章节锚定）
  4. **精修回放（2026-08-09；2026-08-10 加固）**：`/plot` 深链优先 `chartAssetId`；点击精修时用 **`localStorage`** 暂存 `figureSpecEnc`（`target=_blank` 新标签读不到 `sessionStorage`）；`GET /api/projects/:id/charts` 供绘图页按资产/图片 URL 回放；`uiTranscript` 持久化 `plotHref` + 轻量快照字段。配图坞无稳链时从资产重建，禁止落空 `/plot`

## 主要 API

| 路径 | 用途 |
|------|------|
| `POST /api/chart` | 通用 matplotlib 图（含 stack_offset / dft_*） |
| `POST /api/table` | 三线表 + ANOVA 文案 |
| `POST /api/xrd/*` | XRD 实验室（含 stack、scherrer） |
| `POST /api/dft/vasp` | VASP DOSCAR / EIGENVAL / PROCAR → DOS/能带/投影能带 |
| `POST /api/flow-diagram` | 流程示意 |
| `POST /api/mol-diagram` | 分子结构 |
| `POST /api/save-chart` | 持久化输出 |

### XRD 扩展

| 路径 | 用途 |
|------|------|
| `POST /api/xrd/stack` | 多文件 FormData → offset 叠加图 |
| `POST /api/xrd/scherrer` | JSON 峰表 → 晶粒尺寸柱状图 |

## 前端入口

- `/plot` 独立页（分类含 DFT）
- 工作台侧边栏图表按钮
- 工作台 **Agent Tab**：`list_plot_sources` → `generate_chart`

## Agent 配图链路（2026-07-25）

```text
Data Tab 上传 CSV → Project.dataSources（含 chartConfigs）
    → list_plot_sources（候选 index）
    → generate_chart(chartIndex / csvData+chartType)
    → Python runChartGeneration → data/charts/*.png
    → Project.charts（含 figureSpecEnc 可回放）
    → 可选 sectionKey：Markdown 图片写入章节
    → 工作台刷新 project.charts + Agent 气泡缩略图
```

| 文件 | 职责 |
|------|------|
| `lib/agent/plot-sources.ts` | 候选目录 |
| `lib/agent/tools/generate-chart.ts` | 出图 + 回放快照 + 可选插章节 |
| `lib/agent/chart-persist.ts` | 写入 `Project.charts` |
| `lib/agent/chart-persisted.ts` | 前端解析 observation |
| `lib/chart-tabular-parse.ts` | CSV→labels/datasets（回放；误差列 `*_sd`/`*_err`） |

## Origin 向约定

- 误差列：表头后缀 `_sd` / `_sem` / `_se` / `_err` / `_std` / `_ci` 自动配对
- 折线：`dual_y`（末列右轴）、`show_trendline`、`show_shadow`
- 多谱：`stack_offset`（CSV 多列）或 `xrd_stack`（多文件）

## 仪器格式（FIG-PR-003）

- 解析入口：`scripts/charts/instrument_io.py`（由 `load_dataframe` 自动调用）
- 支持：`.xy` / `.xyd`、Rigaku `.ras`、ASCII `.raw` / `.uxd` / `.dif`
- 二进制 Bruker `.raw` / Jade `.mdi`：拒绝并提示先导出为 `.xy`/`.csv`
- 上传 accept：`src/lib/xrd-file-ext.ts` → XRD 各 Card / API

## DFT 数据约定

- **能带 CSV** `dft_band`：首列 k 坐标，后续 band 列；`symmetry_points` 如 `Γ:0,X:0.5`；可选 `fermi_energy`
- **DOS CSV** `dft_dos`：首列能量，后续 Total/分波；`orientation=vertical|horizontal`
- **VASP 原生** `dft_vasp_dos` / `dft_vasp_band` / `dft_vasp_procar`：`POST /api/dft/vasp` + `vasp_io.py` / `dft_vasp.py`
  - DOSCAR → Total（含 spin）+ 可选离子投影 s/p/d 粗加总
  - EIGENVAL → k 路径距离归一化能带；可用 DOSCAR/OUTCAR 取 E-fermi
  - PROCAR → 轨道投影 fat bands（`dft_procar`；可选离子子集、s/p/d/tot）

## 改动清单

- 新图表类型 → `registry.json` + Python 模块 + 本节 + [`API_INDEX.md`](../API_INDEX.md)
- 科研作图 PR → [`plans/FIG-PR-scientific-plotting.md`](../plans/FIG-PR-scientific-plotting.md)
