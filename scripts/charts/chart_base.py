"""
图表模块基类 — 所有图表类型继承此类，实现 plot() 方法。
统一接口：plot(labels, datasets, config, output_path)
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any

import matplotlib
matplotlib.use("Agg")

from plot_style import (  # noqa: E402
    apply_publication_style,
    apply_legend,
    bar_error_kw,
    create_figure,
    get_markers,
    get_palette,
    resolve_style,
    save_figure,
    style_axes,
)

# 向后兼容旧引用
ACADEMIC_COLORS = [
    "#2C3E50", "#C0392B", "#2980B9", "#27AE60",
    "#8E44AD", "#D35400", "#16A085", "#E67E22",
    "#1A5276", "#922B21", "#1F618D", "#1E8449",
]


class ChartModule:
    """图表类型基类。子类只需覆写 id 和 plot()。"""

    id: str = ""

    def validate(self, labels: list[str], datasets: list[dict], config: dict) -> str | None:
        if not labels:
            return "数据为空"
        if not datasets:
            return "缺少数据集"
        n = len(labels)
        for ds in datasets:
            if len(ds.get("data", [])) < n:
                return f"数据集 '{ds.get('label','')}' 数据点不足"
        return None

    def plot(
        self,
        labels: list[str],
        datasets: list[dict],
        config: dict,
        output_path: str,
    ) -> None:
        raise NotImplementedError

    def prepare(self, config: dict) -> dict[str, Any]:
        """解析样式并应用 rcParams。"""
        self._config = config
        style = resolve_style(config)
        apply_publication_style(style)
        spec = config.get("chartSpec") if isinstance(config, dict) else None
        if isinstance(spec, dict):
            layout = spec.get("layout") if isinstance(spec.get("layout"), dict) else {}
            journal = spec.get("journal") if isinstance(spec.get("journal"), dict) else {}
            if layout.get("xTickRotation") not in (None, ""):
                style["x_tick_rotation"] = layout["xTickRotation"]
            if layout.get("showValues") is True:
                style["show_values"] = True
            loc = layout.get("legend")
            if loc and loc != "auto":
                style["legend_loc"] = loc
            if journal.get("columns") in (1, 2) and "fig_width" not in (config.get("style") or {}):
                style["columns"] = journal["columns"]
        return style

    def new_figure(self, style: dict[str, Any]):
        return create_figure(style)

    def colors(self, style: dict[str, Any], n: int) -> list[str]:
        style = dict(style)
        style["_series_count"] = n
        return get_palette(style, n)

    def markers(self, style: dict[str, Any], n: int) -> list[str]:
        return get_markers(n)

    def apply_axis_extras(self, ax, config: dict, style: dict[str, Any]) -> None:
        """Nature-figure 常用轴选项：对数刻度、科学计数法、刻度旋转。"""
        if config.get("y_log_scale") in (True, "true", "1", 1):
            ax.set_yscale("log")
        # y_sci_notation: style（来自全局样式面板）优先于 config（来自图表专属配置）
        sci = style.get("y_sci_notation")
        if sci in (True, "true", "1", 1):
            try:
                ax.ticklabel_format(axis="y", style="sci", scilimits=(0, 0))
            except AttributeError:
                pass
        elif config.get("y_sci_notation") in (True, "true", "1", 1):
            try:
                ax.ticklabel_format(axis="y", style="sci", scilimits=(0, 0))
            except AttributeError:
                pass
        # x_tick_rotation: style 优先，config 为后备（兼容旧调用）
        rot = style.get("x_tick_rotation")
        if rot is not None and rot != "" and rot != 0:
            try:
                ax.tick_params(axis="x", labelrotation=float(rot))
            except (TypeError, ValueError):
                pass
        elif config.get("x_tick_rotation") is not None and config.get("x_tick_rotation") != "":
            try:
                ax.tick_params(axis="x", labelrotation=float(config["x_tick_rotation"]))
            except (TypeError, ValueError):
                pass

    def finalize_axes(
        self,
        ax,
        style: dict[str, Any],
        *,
        config: dict | None = None,
        title: str = "",
        x_label: str = "",
        y_label: str = "",
        has_legend: bool = False,
        grid_axis: str = "y",
    ) -> None:
        from plot_utils import _normalize_label

        if x_label:
            ax.set_xlabel(_normalize_label(x_label), labelpad=6)
        if y_label:
            ax.set_ylabel(_normalize_label(y_label), labelpad=6)
        if title:
            ax.set_title(_normalize_label(title), fontweight="bold", pad=10)
        style_axes(ax, style, grid_axis=grid_axis)
        if config:
            self.apply_axis_extras(ax, config, style)
        apply_legend(ax, style, has_legend)

    def save(self, fig, output_path: str, style: dict[str, Any]) -> list[str]:
        from layout_solver import run_layout_and_save

        config = getattr(self, "_config", {})
        return run_layout_and_save(fig, output_path, style, config if isinstance(config, dict) else {})

    def read_significance(self, config: dict) -> list:
        """config.significance，否则 ChartSpec.annotations.significance。"""
        raw = config.get("significance") if isinstance(config, dict) else None
        if raw in (None, "", []):
            spec = config.get("chartSpec") if isinstance(config, dict) else None
            if isinstance(spec, dict):
                ann = spec.get("annotations") if isinstance(spec.get("annotations"), dict) else {}
                raw = ann.get("significance") if isinstance(ann, dict) else None
        if raw in (None, "", []):
            return []
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except (TypeError, ValueError):
                return []
        return raw if isinstance(raw, list) else []

    def dataset_errors(self, ds: dict, n: int) -> list[float] | None:
        raw = ds.get("errors") or ds.get("error") or ds.get("yerr")
        if not raw:
            return None
        errs = list(raw)[:n]
        if len(errs) < n:
            return None
        try:
            return [float(v) for v in errs]
        except (TypeError, ValueError):
            return None

    def annotate_bar_values(self, ax, bars, style: dict[str, Any]) -> None:
        if not style.get("show_values"):
            return
        fs = max(float(style.get("font_size", 8)) - 1, 6)
        for bar in bars:
            h = bar.get_height()
            if h == 0:
                continue
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                h,
                f"{h:.2g}",
                ha="center",
                va="bottom",
                fontsize=fs,
            )

    def bar_kwargs(self, style: dict[str, Any]) -> dict[str, Any]:
        if style.get("bar_edge"):
            return {"edgecolor": "black", "linewidth": 0.8}
        return {"edgecolor": "white", "linewidth": 0.5}

    def error_kwargs(self, style: dict[str, Any]) -> dict:
        return bar_error_kw(style)

    def draw_category_significance(
        self,
        ax,
        cat_top: dict[int, float],
        config: dict,
        style: dict[str, Any],
    ) -> None:
        """类别级显著性标注（单类星号 + 跨类括号），供堆积柱/柱状等复用。

        cat_top: {category 序号: 该类别顶部 y（含误差）}
        config.significance 条目：
          {"category": i, "value": "**", "label": "p<0.01"}          # 单类顶部
          {"fromCategory": a, "toCategory": b, "value": "*"}          # 跨类括号
        """
        sig = self.read_significance(config)
        if not sig:
            return

        fs = max(float(style.get("font_size", 8)) - 1, 6)
        gap = fs * 0.18
        # 已用 y 占位（按 x 中心区间）避免标注重叠
        used: list[tuple[float, float, float]] = []

        def next_y(x_center: float, base_y: float) -> float:
            y = base_y
            for (ux0, ux1, uy) in used:
                if ux0 <= x_center <= ux1:
                    y = max(y, uy + gap * 3)
            return y

        for item in sig:
            if not isinstance(item, dict):
                continue
            value = str(item.get("value", "")).strip()
            if not value:
                continue
            label = item.get("label")
            text = value + (f" {label}" if label else "")

            fc = item.get("fromCategory")
            tc = item.get("toCategory")
            if fc is not None and tc is not None:
                try:
                    fc_i, tc_i = int(fc), int(tc)
                except (TypeError, ValueError):
                    continue
                if tc_i <= fc_i:
                    continue
                base_y = max(
                    (cat_top.get(i, 0.0) for i in range(fc_i, tc_i + 1)), default=0.0,
                )
                x0, x1 = fc_i - 0.35, tc_i + 0.35
                y = next_y((x0 + x1) / 2, base_y + gap)
                tick = gap * 0.6
                ax.plot(
                    [x0, x0, x1, x1], [y, y + tick, y + tick, y],
                    color="black", lw=0.8, clip_on=False, zorder=4,
                )
                ax.text(
                    (x0 + x1) / 2, y + tick, text,
                    ha="center", va="bottom", fontsize=fs, clip_on=False, zorder=4,
                )
                used.append((x0, x1, y + tick))
                continue

            ci = item.get("category")
            try:
                ci_i = int(ci)
            except (TypeError, ValueError):
                continue
            if ci_i not in cat_top:
                continue
            y = next_y(float(ci_i), cat_top[ci_i] + gap)
            ax.text(
                float(ci_i), y, text,
                ha="center", va="bottom", fontsize=fs, clip_on=False, zorder=4,
            )
            used.append((float(ci_i), float(ci_i), y + gap * 0.6))


def load_registry(registry_path: str | None = None) -> dict:
    if registry_path is None:
        registry_path = os.path.join(os.path.dirname(__file__), "registry.json")
    with open(registry_path, "r", encoding="utf-8") as f:
        return json.load(f)


def get_module_map() -> dict[str, type[ChartModule]]:
    import importlib
    import pkgutil

    types_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chart_types")
    mapping: dict[str, type[ChartModule]] = {}

    if not os.path.isdir(types_dir):
        return mapping

    parent_dir = os.path.dirname(types_dir)
    if parent_dir not in sys.path:
        sys.path.insert(0, parent_dir)

    for _finder, name, _ispkg in pkgutil.iter_modules([types_dir]):
        if name.startswith("_") or name.startswith("."):
            continue
        try:
            mod = importlib.import_module(f"chart_types.{name}")
        except Exception as e:
            print(f"[chart_base] Skip {name}: {e}", file=sys.stderr)
            continue

        for attr_name in dir(mod):
            attr = getattr(mod, attr_name)
            if (
                isinstance(attr, type)
                and issubclass(attr, ChartModule)
                and attr is not ChartModule
                and attr.id
            ):
                mapping[attr.id] = attr

    return mapping
