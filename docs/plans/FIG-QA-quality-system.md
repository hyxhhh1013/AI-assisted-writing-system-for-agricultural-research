# FIG-QA — 图表生成质量系统

> **状态**：规划生效（2026-08-22）  
> **定位**：把出图从「类型齐全 + 识图事后看一眼」升级为「规格编译 + 布局求解 + 确定性质检 + 结构化回修」。  
> **挂载**：队列 **Phase 13 `FIG-QA-*`**；实时 status 只看 [`ENGINEERING_OPTIMIZATION_QUEUE.md`](../ENGINEERING_OPTIMIZATION_QUEUE.md) §1。  
> **对照**：nature-figure 的 figure contract / QA contract（结论先行、刊规、可编辑文字、灰度可辨）；**不**引入 R 后端，**不**另起桌面编辑器。

---

## 0. 为什么现在还是工程问题

Phase 12（FIG-PR）已经把 **能力面** 铺开：11 类数据图、XRD/Jade、DFT、期刊预设、误差棒、显著性、CJK 解码、Agent 出图闭环。这些都是「能画出某种图」。

质量面仍然碎：

| 层 | 现状 | 失败模式 |
|----|------|----------|
| 规格 | Agent 把松散 `configJson` 塞进 Python；`generate_chart` 默认只传 title / 轴标 / preset | LLM 猜参数；单位、误差列、显著性经常丢 |
| 布局 | 各类型自己 `tight_layout` / `bbox_inches`；XRD 遗留脚本仍 `dpi=200` | 刻度重叠、图例挡数据、显著性括号顶出画布、栏宽被 tight 裁歪 |
| 校验 | `validate_style` 只查宽/字号/DPI/线宽/灰度提示 | 元数据过了，画面仍不可投稿 |
| 识图 QA | `figure-qa.ts` 为**机理图**写的（占位、英文模板、节点过载） | 数据图的真实硬伤（重叠、缺单位、豆腐字）几乎检不到 |
| 回修 | 判定 `regen` → 整图重画；`polish` → 推人去 `/plot` | 没有「缺陷 → 改规格字段」的补丁环 |
| 回归 | TS 测的是 plumbing（下标、落盘、防叠图） | 没有 golden fixture，改 `bar_grouped` 不知会不会挤爆标签 |

产品口头禅「Agent=草稿，/plot=期刊精修」把质量责任推给了人。这在类型扩张期合理，现在类型已齐，再靠人工精修会把质量债锁死。

**根因一句话**：出图被当成「调 matplotlib 模板」，没有被当成「编译器」。

---

## 1. 目标态

Agent 或 `/plot` 提交的是 **语义意图**，不是一锅 rcParams。系统编译成可校验的 `ChartSpec`，求解布局，渲染，再跑确定性质检；失败则补丁规格重跑，而不是整图重掷骰子。

```text
意图（用户 / Agent / /plot 表单）
    → ChartSpec IR（类型化、版本化）
    → Spec Compiler（单位、误差列、刊规包、显著性）
    → Layout Solver（碰撞、刻度旋转、图例、边距）
    → Renderer（唯一 save 路径，matplotlib）
    → Deterministic QA（几何 + 刊规 + 像素）
    → 可选 Vision QA（只覆盖示意图 / 残余灰区）
    → Spec Patch Loop（finding → 改 spec 字段，最多 N 轮）
    → Persist + replay（figureSpecEnc 仍可回放）
```

验收口径（主轴收口时必须同时成立）：

1. 中文类别名柱状图：无缺字、刻度不重叠、轴标签带单位。  
2. 带 `_sd` 的分组柱：误差棒 + 显著性括号不撞柱顶、不裁出画布。  
3. 双栏 `agr_journal` 主图：实际图宽 ≈ 刊规 ±8%，导出 png+svg+pdf。  
4. Agent 出图 observation 带结构化 `qaReport`（code 级 findings），不再只有「可接受·建议精修」。  
5. 11 个数据图类型各有 1 条 golden fixture；改渲染器必须跑 `npm run test:figures`。

---

## 2. 明确不做

| 项 | 原因 |
|----|------|
| 新桌面级编辑器 / Illustrator 替代品 | 继续 `registry.json` + Python + `/plot` 精修 |
| R / ggplot 双后端 | 本仓库 Python 已是唯一渲染器 |
| 再堆新图表类型 | 质量未闭环前禁止扩类型 |
| 用 VLM 当主质检 | 贵、不稳、机理图 prompt 套不到数据图 |
| 每个 `chart_types/*.py` 再开一轮「提质 PR」 | 那是旧路径，会继续分叉 |
| 热路径 LLM-judge 打分 | 对齐写作侧：规则尺进 CI，模型尺只进评测脚本 |

---

## 3. 质量合同（什么叫「过」）

对照 nature-figure QA contract，裁成本仓库可自动判定的五层。**L0–L3 必须确定性**；L4 可选；L5 只给示意图。

| 层 | 名称 | 过线条件 | 实现位置 |
|----|------|----------|----------|
| **L0** | 数据完整 | 有源表；轴标签含单位或显式 `unitless`；误差列类型声明（sd/se/ci）；`n` 可追溯到 spec | Spec Compiler |
| **L1** | 刊规几何 | 栏宽 mm、字号、DPI≥300（线稿建议 600）、PDF fonttype 42、高度不超页 | 现有 `validate_style` 升级为硬门 |
| **L2** | 布局几何 | 文本/标注/图例 bbox 互不重叠；不 `clip_on` 裁字；刻度过密则旋转或抽稀；panel (a)(b) 在左上且不挡数据 | **新建** Layout Solver + bbox QA |
| **L3** | 可及性 | CJK 字体在拉丁之前；无 tofu（像素连通域或 font glyph 探测）；灰度相邻对比；不靠红绿唯一编码 | `font_setup` + 像素 QA |
| **L4** | 科学主张 | 每面板一句 claim；显著性条目能对上数据下标；题注与 spec.caption 一致 | Agent / 导出清单 |
| **L5** | 示意残余 | 占位框、英文模板节点、空栏——**仅** flow / mechanism | 现有 `figure-qa.ts` 收窄 scope |

判定三态与现网对齐，但 **code 必须机器可读**：

```text
block  → 不能入库 / 不能插入章节（L0 缺单位、L2 重叠、L3 缺字）
repair → 自动改 spec 再渲染（旋转刻度、外置图例、加高画布、补 y_label）
pass   → 可插入；warn 级仅提示（如 pastel 配色）
```

旧的「需重生成 / 建议精修 / 可接受」只作为对用户的中文标签，底层以 `qaReport.findings[].code` 为准。

---

## 4. ChartSpec IR（单一事实源）

新契约：`src/contracts/chart-spec.ts`。Python 侧镜像只读同一 JSON 形状（`scripts/charts/chart_spec.py` 校验，不另造字段名）。

```ts
interface ChartSpecV1 {
  version: 1;
  archetype: "quantitative" | "schematic" | "instrument" | "dft";
  chartType: string;          // registry id
  claim: string;              // 这张图要辩护的一句话
  data: {
    sourceKind: "csv" | "projectIndex" | "peaks" | "vasp";
    csv?: string;
    chartIndex?: number;
    columns?: { x: string; y: string[]; errors?: Record<string, "sd" | "se" | "ci"> };
  };
  encoding: {
    xLabel: string;           // 必须带单位或 unitless:true
    yLabel: string;
    unitless?: boolean;
    series?: string[];
  };
  journal: {
    preset: ChartStylePreset;
    columns: 1 | 2;
    exportFormats: ChartExportFormat[];
  };
  annotations?: {
    significance?: SignificanceMark[];
    panelLabel?: string;
  };
  layout?: {
    xTickRotation?: number;
    legend: "auto" | "outer-right" | "outer-bottom" | "none";
    showValues?: boolean;
  };
  caption: string;
}
```

规则：

- Agent **禁止**再传任意 `configJson` 作为主路径；只许传 `ChartSpec` 或「候选 index + 意图」。  
- `/plot` 表单编译成同一 Spec，回放 `figureSpecEnc` 必须能 decode 回 `ChartSpecV1`。  
- 旧 `FigureSpec.config` 由适配器升格，不立刻删。

---

## 5. 布局求解（质量的技术核心）

新建 `scripts/charts/layout_solver.py`，**所有数据图**在 `save` 前调用。禁止各类型再手写一套 `tight_layout`。

最小求解循环（确定性，不调模型）：

1. 渲染到 Figure（不落盘）。  
2. 收集 artist bbox：tick / axis label / title / legend / bar value / significance / panel label。  
3. 检测：重叠、出画布、与数据 ink 重叠。  
4. 按优先级打补丁（每次只改一类，避免震荡）：  
   - 刻度过密 → 旋转 35° → 仍密则抽稀  
   - 图例挡柱/线 → `outer-right` → 仍挡则 `outer-bottom`  
   - 显著性顶出 → 加 `ylim` 上沿 12%  
   - 轴标签溢出 → 加 pad / 加高 fig_height  
5. 最多 4 轮；仍失败则产出 `block` finding，交给 QA，不静默 `bbox_inches=tight` 把刊宽裁掉。

`save_figure` 改为：

- 先跑 solver；  
- **默认不再** `bbox_inches=tight`（它会破坏栏宽合同）；  
- 需要出血时用 solver 算出的 pad，而不是 matplotlib 事后裁切。

遗留 XRD/旧脚本（`plot_generic.py` 末尾、`xrd_*.py` 的 `dpi=200`）在 FIG-QA-003 统一收口到 `save_figure`。

---

## 6. 确定性质检

新建 `scripts/charts/qa_report.py`，出图后与 PNG 一起回传。

| code | 层 | 默认动作 |
|------|----|----------|
| `missing_unit` | L0 | repair：若列名含 `(...)` 则回填；否则 block |
| `error_col_unpaired` | L0 | block |
| `width_off_spec` | L1 | repair：强制刊宽 |
| `font_too_small` | L1 | block |
| `label_overlap` | L2 | repair：走 solver |
| `legend_covers_data` | L2 | repair：外置图例 |
| `annotation_clipped` | L2 | repair：加 ylim / pad |
| `cjk_tofu` | L3 | block（字体栈失败，不能靠重画碰运气） |
| `grayscale_adjacent` | L3 | warn（print_bw 升为 repair：加标记） |
| `significance_oob` | L0/L2 | block（下标对不上数据） |

TypeScript 侧：`src/contracts/chart-qa.ts` 镜像 findings。`runChartGeneration` 已有 `styleValidation`，升格为 `qaReport`（含 L1–L3），旧字段做兼容别名。

Vision QA **降级**：

- 数据图 / XRD / DFT：默认不跑 GLM-4V。  
- 仅 `flow` / `mechanism_panel` / `mol` 继续 `figure-qa.ts`。  
- Agent `figure-loop`：数据图改看 `qaReport.block`，不再用机理图 prompt 判「需重生成」。

---

## 7. Agent 回修环

替换「识图不及格 → 整图重画」：

```text
generate_chart(spec)
  → qaReport
  → 若有 repairable findings：applyChartSpecPatches(spec, findings) 再渲染（≤2 次）
  → 仍有 block：observation 带 findings，禁止插入章节
  → pass：入库 + 可选插节
```

`applyChartSpecPatches` 是纯函数（TS + 同步到 Python 的同一张补丁表），例如：

- `label_overlap` → `layout.xTickRotation = 35`  
- `legend_covers_data` → `layout.legend = "outer-right"`  
- `missing_unit` + 列名 `产量(kg/ha)` → `encoding.yLabel = "产量 (kg/ha)"`

模型不再自由改 `configJson`。用户口头「把图例放到下面」编译成 spec patch，不是再生成一张新图叠上去。

---

## 8. PR 总表

| ID | 标题 | 依赖 | 估时 | 状态 |
|----|------|------|------|------|
| **FIG-QA-000** | 本计划 + 队列挂载 + 域文档指针 | — | 0.5d | **done** |
| **FIG-QA-001** | `ChartSpecV1` + `ChartQaReport` 契约；旧 FigureSpec 适配器 | 000 | 1d | **done** |
| **FIG-QA-002** | Spec Compiler：CSV/chartIndex → 合法 Spec（单位、误差列、刊规包） | 001 | 1.5d | **done** |
| **FIG-QA-003** | 统一 `save_figure`；消灭 dpi=200 / 分叉 tight_layout | 001 | 1d | **done** |
| **FIG-QA-004** | Layout Solver + bbox QA（重叠/裁切/图例） | 003 | 2d | **done** |
| **FIG-QA-005** | 自动补丁环 `applyChartSpecPatches`（≤2 次重渲染） | 002, 004 | 1d | **done** |
| **FIG-QA-006** | Golden fixtures：11 数据图 + 中文刻度 + 显著性夹具；`test:figures` | 004 | 1.5d | **done** |
| **FIG-QA-007** | `generate_chart` 主路径改吃 Spec；禁裸 configJson | 002, 005 | 1d | **done** |
| **FIG-QA-008** | 拆 QA：数据图看 qaReport；机理图才走 vision | 007 | 0.5d | **done** |
| **FIG-QA-009** | 刊规包 + 导出清单（svg/pdf + source csv + qa 摘要） | 001, 003 | 1d | **done** |
| **FIG-QA-010** | 类型质量剖面：先 bar_grouped / line / heatmap 三件套收口 | 006, 007 | 1.5d | **done** |

建议执行序：`000 → 001 → 003 ∥ 002 → 004 → 005 → 006 → 007 → 008 → 009 → 010`。

**先做 001+003+004**：没有 IR 和布局求解，后面的 Agent 接线都是空转。

---

## 9. 代码入口（改前 rg）

| 区域 | 路径 |
|------|------|
| 契约 | `src/contracts/figure.ts`、`chart-style.ts`、`data-source.ts`（`ChartConfig` 过窄，勿再扩它） |
| 出图 | `src/lib/chart-runner.ts`、`src/lib/agent/tools/generate-chart.ts` |
| 闭环 | `src/lib/agent/figure-loop.ts`、`figure-qa.ts`、`tools/read-figure.ts` |
| 样式 | `scripts/charts/plot_style.py`、`font_setup.py`、`chart_base.py` |
| 类型 | `scripts/charts/chart_types/*.py`、`plot_generic.py` |
| 回放 | `src/contracts/figure.ts` `figureSpecEnc`、`lib/chart-tabular-parse.ts` |
| 测试 | 现只有 TS plumbing；新加 `scripts/charts/_fixtures/qa/` + `src/__tests__/lib/chart-spec*.test.ts` |

影响范围关键词：`styleValidation`、`validate_style`、`save_figure`、`bbox_inches`、`FIGURE_QA_PROMPT`、`configJson`。

---

## 10. 验证

每个 PR：

```text
npx tsc --noEmit
npx vitest run src/__tests__/lib/chart-spec src/__tests__/lib/agent-figure-loop
# FIG-QA-006 起：
npm run test:figures
```

`test:figures`（006 新增）：对每个 golden CSV 出图，断言 `qaReport` 无 `block`，并对比关键几何（bbox 数、是否重叠），**不**做像素级 golden PNG（跨机器字体会抖）。缺字用 glyph 探测，不靠截图像素。

---

## 11. 文档同步

| 改动 | 文档 |
|------|------|
| 本计划 | 本文 |
| 队列状态 | `ENGINEERING_OPTIMIZATION_QUEUE.md` §1 Phase 13 + §4 + §5 |
| 域摘要 | `domain/figures-and-python.md` 增加「质量系统」一节 |
| 入口 | `DOMAIN_INDEX.md` 图表表加 FIG-QA 行 |
| 战略 | `MASTER_PLAN.md` 增 Wave 3.11 一行（质量系统，不挡 Wave 4 导出） |
| 新/改 API | `qaReport` 进 `API_INDEX.md`（003/007 落地时） |

---

## 12. 完成检查（主轴收口）

- [x] §8 表 001～010 均为 `done`（009 可与 010 并行收）  
- [ ] Agent 出中文柱状图：L0–L3 无 block；observation 含 findings  
- [ ] `/plot` 回放仍走同一 Spec  
- [ ] 机理图 vision QA 仍在，但不再误判数据图  
- [ ] 文档与代码同一批提交  

---

## 13. 会话日志指针

合并时同步：

1. 队列 §1 Phase 13 + §4 + §5  
2. `domain/figures-and-python.md`  
3. 本文只维护口径；status 以队列为准
