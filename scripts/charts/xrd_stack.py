"""
XRD 多谱 offset 叠加 — 对齐 Jade/Origin 多谱对比习惯。
用法: python xrd_stack.py --data-dir <dir> --config <json> --output <png>

config:
{
  "title": "...",
  "x_label": "2θ (degree)",
  "y_label": "Intensity (a.u.)",
  "offset": 0.15,          # 相对最大强度的垂直偏移比例
  "normalize": true,       # 各谱归一化到 [0,1]
  "files": [
    {"path": "a.csv", "label": "Sample A"},
    {"path": "b.csv", "label": "Sample B"}
  ]
}
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from font_setup import apply_cjk_font_rcparams  # noqa: E402
from plot_style import (  # noqa: E402
    apply_publication_style,
    create_figure,
    get_palette,
    resolve_style,
    save_figure,
    style_axes,
)
from plot_utils import _normalize_label, load_dataframe  # noqa: E402

apply_cjk_font_rcparams()


def _xy_from_df(df):
    x = None
    y = None
    for col in df.columns:
        vals = np.asarray(df[col], dtype=float)
        if np.isnan(vals).all():
            continue
        if x is None:
            x = vals
        else:
            y = vals
            break
    if x is None or y is None:
        raise ValueError("需要至少两列数值（2θ, Intensity）")
    mask = ~(np.isnan(x) | np.isnan(y))
    return x[mask], y[mask]


def plot_stack(config: dict, output_path: str) -> dict:
    style = resolve_style(config)
    apply_publication_style(style)
    files = config.get("files") or []
    if len(files) < 1:
        raise ValueError("至少需要一条 XRD 谱")

    offset_frac = float(config.get("offset", 0.15))
    normalize = config.get("normalize", True) in (True, "true", "1", 1)
    title = _normalize_label(config.get("title", "XRD Patterns"))
    x_label = _normalize_label(config.get("x_label", "2θ (degree)"))
    y_label = _normalize_label(config.get("y_label", "Intensity (a.u.)"))

    series = []
    for item in files:
        path = item.get("path")
        if not path or not os.path.isfile(path):
            raise ValueError(f"找不到数据文件: {path}")
        df = load_dataframe(path)
        x, y = _xy_from_df(df)
        label = _normalize_label(item.get("label") or os.path.splitext(os.path.basename(path))[0])
        series.append({"x": x, "y": y, "label": label})

    fig, ax = create_figure(style)
    # 多谱通常需要更宽的图
    fig.set_size_inches(
        float(style.get("fig_width", 3.5)) * max(1.0, min(len(series) / 2, 1.6)),
        float(style.get("fig_height", 2.5)) * (1.0 + 0.15 * max(0, len(series) - 1)),
    )
    colors = get_palette(style, len(series))
    lw = max(float(style.get("axes_linewidth", 0.8)) * 1.5, 1.0)

    for i, s in enumerate(series):
        y = s["y"].astype(float)
        if normalize:
            y_min, y_max = float(np.min(y)), float(np.max(y))
            span = y_max - y_min
            y = (y - y_min) / span if span > 0 else y * 0
            base = 1.0
        else:
            base = float(np.max(np.abs(y))) or 1.0
        y_plot = y + i * offset_frac * base
        ax.plot(s["x"], y_plot, color=colors[i], linewidth=lw, label=s["label"])

    ax.set_xlabel(x_label, labelpad=6)
    ax.set_ylabel(y_label, labelpad=6)
    if title:
        ax.set_title(title, fontweight="bold", pad=10)
    style_axes(ax, style, grid_axis="both")
    if len(series) > 1:
        ax.legend(frameon=bool(style.get("legend_frame")), fontsize=float(style.get("font_size", 8)))
    # 去掉 Y 刻度数值（offset 叠加后无绝对意义）
    if normalize or len(series) > 1:
        ax.set_yticklabels([])

    save_figure(fig, output_path, style)
    plt.close(fig)
    return {
        "n_spectra": len(series),
        "labels": [s["label"] for s in series],
        "normalize": bool(normalize),
        "offset": offset_frac,
    }


def main():
    parser = argparse.ArgumentParser(description="XRD multi-pattern stack")
    parser.add_argument("--config", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8-sig") as f:
        config = json.load(f)

    try:
        data = plot_stack(config, args.output)
        print(json.dumps({"status": "ok", "output": args.output, "data": data}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
