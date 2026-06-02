# 图表与 Python 子进程（L3 业务）

## 注册表（唯一真相源）

- `scripts/charts/registry.json` — 15 种图，4 类
- 新增图表：`chart_types/*.py` + registry 一条 → 前端 `/plot` 自动出现
- API：`GET /api/figures/registry`

## 分类

| 类 | 示例 |
|----|------|
| 数据图 | 柱状/堆积/折线/散点/饼 |
| 示意图 | 流程图、分子结构 |
| XRD | bragg、peakfit、amorphous 等 |
| 表格 | 三线表 GB/T 7714 |

## 调用约定

- 环境变量 **`PYTHON_CMD`**（所有 Python 路由已统一）
- 基类：`scripts/charts/chart_base.py`（`ChartModule` 自动扫描）
- 工作台：`useFigurePipeline` — `findFigureBlocks` / `generateSingleFigure` / `replacePlaceholders`

## 主要 API

| 路径 | 用途 |
|------|------|
| `POST /api/chart` | 通用 matplotlib 图 |
| `POST /api/table` | 三线表 + ANOVA 文案 |
| `POST /api/xrd/*` | XRD 实验室 |
| `POST /api/flow-diagram` | 流程示意 |
| `POST /api/mol-diagram` | 分子结构 |
| `POST /api/save-chart` | 持久化输出 |

## 前端入口

- `/plot` 独立页
- 工作台侧边栏图表按钮

## 改动清单

- 新图表类型 → `registry.json` + Python 模块 + 本节 + [`API_INDEX.md`](../API_INDEX.md)
