"""
Scherrer 晶粒尺寸计算 + 柱状汇总图（Jade 常用后处理）。
D = K λ / (β cos θ)

用法: python xrd_scherrer.py --config <json> --output <png>
config:
{
  "title": "Scherrer crystallite size",
  "wavelength": 1.5406,
  "shape_factor": 0.9,
  "fwhm_unit": "degree",   # degree | radian
  "peaks": [
    {"two_theta": 28.4, "fwhm": 0.25, "label": "(111)"},
    {"two_theta": 47.3, "fwhm": 0.32, "label": "(220)"}
  ]
}
"""
from __future__ import annotations

import argparse
import json
import math
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
from plot_utils import _normalize_label  # noqa: E402

apply_cjk_font_rcparams()


def scherrer_nm(two_theta_deg: float, fwhm: float, wavelength: float, k: float, fwhm_unit: str) -> float:
    theta_rad = math.radians(two_theta_deg / 2.0)
    beta = float(fwhm)
    if fwhm_unit == "degree":
        beta = math.radians(beta)
    if beta <= 0:
        raise ValueError("FWHM 必须 > 0")
    cos_t = math.cos(theta_rad)
    if cos_t <= 0:
        raise ValueError("无效的 2θ")
    # Å → nm
    d_angstrom = (k * wavelength) / (beta * cos_t)
    return d_angstrom / 10.0


def plot_scherrer(config: dict, output_path: str) -> dict:
    peaks = config.get("peaks") or []
    if not peaks:
        raise ValueError("peaks 不能为空")

    wavelength = float(config.get("wavelength", 1.5406))
    k = float(config.get("shape_factor", 0.9))
    fwhm_unit = str(config.get("fwhm_unit", "degree")).lower()
    if fwhm_unit not in ("degree", "radian"):
        fwhm_unit = "degree"

    rows = []
    for i, p in enumerate(peaks):
        two_theta = float(p["two_theta"])
        fwhm = float(p["fwhm"])
        label = _normalize_label(str(p.get("label") or f"#{i + 1}"))
        d_nm = scherrer_nm(two_theta, fwhm, wavelength, k, fwhm_unit)
        rows.append({
            "label": label,
            "two_theta": round(two_theta, 4),
            "fwhm": round(fwhm, 6),
            "size_nm": round(d_nm, 3),
        })

    style = resolve_style(config)
    apply_publication_style(style)
    title = _normalize_label(config.get("title", "Scherrer crystallite size"))
    fig, ax = create_figure(style)
    colors = get_palette(style, max(len(rows), 1))
    labels = [r["label"] for r in rows]
    sizes = [r["size_nm"] for r in rows]
    x = np.arange(len(rows))
    bars = ax.bar(x, sizes, color=colors[: len(rows)], edgecolor="black", linewidth=0.6)
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_ylabel(_normalize_label("Crystallite size (nm)"), labelpad=6)
    ax.set_xlabel(_normalize_label("Peak"), labelpad=6)
    if title:
        ax.set_title(title, fontweight="bold", pad=10)
    style_axes(ax, style, grid_axis="y")
    fs = max(float(style.get("font_size", 8)) - 1, 6)
    for bar, val in zip(bars, sizes):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height(),
            f"{val:.2f}",
            ha="center",
            va="bottom",
            fontsize=fs,
        )
    save_figure(fig, output_path, style)
    plt.close(fig)

    mean_size = float(np.mean(sizes)) if sizes else 0.0
    return {
        "wavelength": wavelength,
        "shape_factor": k,
        "fwhm_unit": fwhm_unit,
        "peaks": rows,
        "mean_size_nm": round(mean_size, 3),
        "n_peaks": len(rows),
    }


def main():
    parser = argparse.ArgumentParser(description="Scherrer crystallite size")
    parser.add_argument("--config", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8-sig") as f:
        config = json.load(f)

    try:
        data = plot_scherrer(config, args.output)
        print(json.dumps({"status": "ok", "output": args.output, "data": data}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
