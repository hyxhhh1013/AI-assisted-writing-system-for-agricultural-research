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
        style = resolve_style(config)
        apply_publication_style(style)
        return style

    def new_figure(self, style: dict[str, Any]):
        return create_figure(style)

    def colors(self, style: dict[str, Any], n: int) -> list[str]:
        return get_palette(style, n)

    def apply_axis_extras(self, ax, config: dict, style: dict[str, Any]) -> None:
        """Nature-figure 常用轴选项：对数刻度、科学计数法、刻度旋转。"""
        if config.get("y_log_scale") in (True, "true", "1", 1):
            ax.set_yscale("log")
        if config.get("y_sci_notation") in (True, "true", "1", 1) or style.get("y_sci_notation") in (True, "true", "1", 1):
            ax.ticklabel_format(axis="y", style="sci", scilimits=(0, 0))
        rot = config.get("x_tick_rotation")
        if rot is not None and rot != "":
            try:
                ax.tick_params(axis="x", labelrotation=float(rot))
            except (TypeError, ValueError):
                pass
        elif style.get("x_tick_rotation"):
            try:
                ax.tick_params(axis="x", labelrotation=float(style["x_tick_rotation"]))
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
        return save_figure(fig, output_path, style)

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
