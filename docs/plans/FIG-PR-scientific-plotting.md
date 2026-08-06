# FIG-PR — 科研作图靠拢 Jade / Origin / DFT

> 目标：把 `/plot` 从「通用图表模板」靠向课题组常用的 **Jade（XRD）/ Origin（科学图层）/ DFT（计算化学）** 工作流。  
> 架构约束：继续走 `registry.json` + Python 模块 + `services/`，不另起桌面级编辑器。  
> 最后更新：2026-07-27

## 优先级

| 序 | 轨 | 说明 |
|----|----|------|
| 1 | Jade / XRD | 已有 peakfit 等，补多谱叠加 + Scherrer 最快见效 |
| 2 | Origin 向 | 双 Y、误差棒列（已有）、线性拟合、offset 堆叠谱 |
| 3 | DFT | 新分类：能带 + DOS/PDOS（CSV 先行，后续再接 VASP 原生） |

## §1 PR 总表

| ID | 标题 | 依赖 | 估时 | 状态 |
|----|------|------|------|------|
| FIG-PR-001 | XRD 多谱 offset 叠加 | — | 0.5d | **done** |
| FIG-PR-002 | Scherrer 晶粒尺寸 | — | 0.5d | **done** |
| FIG-PR-003 | 仪器格式导入（.xy/.xyd/.ras/ASCII .raw） | 001 | 1d | **done** |
| FIG-PR-010 | 折线双 Y + 线性拟合 | — | 0.5d | **done** |
| FIG-PR-011 | 光谱 offset 堆叠图（Origin 瀑布） | — | 0.5d | **done** |
| FIG-PR-012 | 误差棒列提示 + CSV 后端配对 | 010 | 0.5d | **done** |
| FIG-PR-020 | registry 新增 `dft` 分类 | — | 0.5d | **done** |
| FIG-PR-021 | 能带结构图 `dft_band` | 020 | 0.5d | **done** |
| FIG-PR-022 | DOS/PDOS 图 `dft_dos` | 020 | 0.5d | **done** |
| FIG-PR-023 | VASP DOSCAR/EIGENVAL 解析 | 021,022 | 2d | **done** |
| FIG-PR-024 | PROCAR 轨道投影能带 | 023 | 2d | **done** |
| FIG-PR-025 | 峰拟合输出 FWHM → Scherrer 自动填充 | 001,002 | 1d | **done** |
| FIG-PR-026 | XRD 相检索 MVP（内置参考库 + 工作流） | 001 | 1d | **done** |

## 数据流

```text
UI (/plot) → services/xrd|figures → /api/xrd/*|/api/chart
  → PYTHON_CMD + scripts/charts/*
  → data/charts/*.png → 插入 Project.charts / section
```

## 交付约定

- 新图：`registry.json` + Python +（XRD 专用则）Card + `plot-figure-panel` 接线
- 文档：`docs/domain/figures-and-python.md`、`DOMAIN_INDEX.md`、本队列与 `ENGINEERING_OPTIMIZATION_QUEUE` Phase 12
- 验证：`npx tsc --noEmit`；相关 vitest；Python 脚本可本地 `--help` / 样例跑通
