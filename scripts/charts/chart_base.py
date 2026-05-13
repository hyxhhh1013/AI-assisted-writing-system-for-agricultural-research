"""
图表模块基类 — 所有图表类型继承此类，实现 plot() 方法。
统一接口：plot(labels, datasets, config, output_path)
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import matplotlib
matplotlib.use("Agg")


# 学术配色（nature-figure 推荐：低饱和、色盲友好、打印清晰）
ACADEMIC_COLORS = [
    "#2C3E50", "#C0392B", "#2980B9", "#27AE60",
    "#8E44AD", "#D35400", "#16A085", "#E67E22",
    "#1A5276", "#922B21", "#1F618D", "#1E8449",
]


class ChartModule:
    """图表类型基类。子类只需覆写 id 和 plot()。"""

    id: str = ""  # 对应 registry.json 中的 id

    def validate(self, labels: list[str], datasets: list[dict], config: dict) -> str | None:
        """验证输入数据。返回 None 表示通过，否则返回错误信息。"""
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
        """子类实现：绘制图表并保存到 output_path。"""
        raise NotImplementedError


def load_registry(registry_path: str | None = None) -> dict:
    """加载 registry.json"""
    if registry_path is None:
        registry_path = os.path.join(os.path.dirname(__file__), "registry.json")
    with open(registry_path, "r", encoding="utf-8") as f:
        return json.load(f)


def get_module_map() -> dict[str, type[ChartModule]]:
    """返回 {chart_id: ChartModule子类} 映射，惰性加载 chart_types/ 目录。"""
    import importlib
    import pkgutil

    types_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chart_types")
    mapping: dict[str, type[ChartModule]] = {}

    if not os.path.isdir(types_dir):
        return mapping

    # 将 chart_types 目录加入 sys.path，使 importlib.import_module 能找到
    parent_dir = os.path.dirname(types_dir)
    if parent_dir not in sys.path:
        sys.path.insert(0, parent_dir)

    for finder, name, ispkg in pkgutil.iter_modules([types_dir]):
        if name.startswith("_") or name.startswith("."):
            continue
        try:
            mod = importlib.import_module(f"chart_types.{name}")
        except Exception as e:
            # 跳过无法加载的模块（依赖缺失等）
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
