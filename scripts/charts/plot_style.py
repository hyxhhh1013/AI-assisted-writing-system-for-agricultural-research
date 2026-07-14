"""
期刊级 matplotlib 样式 — 对齐 nature-figure 配色与导出规范。
config.style 可选字段见 registry.json global_style_fields。
"""
from __future__ import annotations

import os
from typing import Any

import matplotlib.pyplot as plt

from font_setup import apply_cjk_font_rcparams

# nature-figure references/api.md — 色盲友好、打印清晰
PALETTE_NATURE = {
    "blue_main": "#0F4D92",
    "blue_secondary": "#3775BA",
    "green_3": "#8BCF8B",
    "red_strong": "#B64342",
    "teal": "#42949E",
    "violet": "#9A4D8E",
    "neutral_light": "#CFCECE",
    "neutral_mid": "#767676",
    "neutral_dark": "#4D4D4D",
}

DEFAULT_COLORS_NATURE = [
    PALETTE_NATURE["blue_main"],
    PALETTE_NATURE["green_3"],
    PALETTE_NATURE["red_strong"],
    PALETTE_NATURE["teal"],
    PALETTE_NATURE["violet"],
    PALETTE_NATURE["neutral_mid"],
    PALETTE_NATURE["blue_secondary"],
    PALETTE_NATURE["neutral_dark"],
]

PALETTE_AGR = [
    "#2C3E50", "#C0392B", "#2980B9", "#27AE60",
    "#8E44AD", "#D35400", "#16A085", "#E67E22",
]

PALETTE_PASTEL = [
    "#484878", "#7884B4", "#B4C0E4", "#E4CCD8",
    "#F0C0CC", "#AADCA9", "#77D7D1", "#B9A7E8",
]

PALETTE_MAP = {
    "nature": DEFAULT_COLORS_NATURE,
    "agr": PALETTE_AGR,
    "pastel": PALETTE_PASTEL,
}

STYLE_PRESETS: dict[str, dict[str, Any]] = {
    "nature": {
        "font_size": 8,
        "axes_linewidth": 0.8,
        "dpi": 600,
        "fig_width": 3.5,
        "fig_height": 2.5,
        "palette": "nature",
        "show_grid": False,
        "legend_frame": False,
        "bar_edge": True,
    },
    "agr_journal": {
        "font_size": 9,
        "axes_linewidth": 1.0,
        "dpi": 300,
        "fig_width": 8.0,
        "fig_height": 4.8,
        "palette": "agr",
        "show_grid": True,
        "legend_frame": True,
        "bar_edge": False,
    },
    "slide": {
        "font_size": 14,
        "axes_linewidth": 1.2,
        "dpi": 200,
        "fig_width": 10.0,
        "fig_height": 6.0,
        "palette": "nature",
        "show_grid": True,
        "legend_frame": True,
        "bar_edge": True,
    },
}


def resolve_style(config: dict) -> dict[str, Any]:
    """合并 preset + config.style 覆盖项。"""
    raw = config.get("style") if isinstance(config.get("style"), dict) else {}
    preset_name = str(raw.get("preset") or config.get("style_preset") or "nature")
    base = dict(STYLE_PRESETS.get(preset_name, STYLE_PRESETS["nature"]))
    base["preset"] = preset_name

    for key in (
        "font_size", "axes_linewidth", "dpi", "fig_width", "fig_height",
        "palette", "show_grid", "legend_frame", "legend_loc", "bar_edge",
        "panel_label", "show_values", "export_formats", "title_font_size",
        "x_tick_rotation", "y_sci_notation",
    ):
        if key in raw and raw[key] is not None and raw[key] != "":
            base[key] = raw[key]

    if isinstance(base.get("show_grid"), str):
        base["show_grid"] = base["show_grid"].lower() in ("1", "true", "yes", "on")
    if isinstance(base.get("legend_frame"), str):
        base["legend_frame"] = base["legend_frame"].lower() in ("1", "true", "yes", "on")
    if isinstance(base.get("bar_edge"), str):
        base["bar_edge"] = base["bar_edge"].lower() in ("1", "true", "yes", "on")
    if isinstance(base.get("show_values"), str):
        base["show_values"] = base["show_values"].lower() in ("1", "true", "yes", "on")
    if isinstance(base.get("y_sci_notation"), str):
        base["y_sci_notation"] = base["y_sci_notation"].lower() in ("1", "true", "yes", "on")

    if not base.get("export_formats"):
        base["export_formats"] = ["png", "svg"]

    return base


def apply_publication_style(style: dict[str, Any]) -> None:
    """全局 rcParams — SVG 文字可编辑；CJK 字体优先于 Arial。"""
    font_size = float(style.get("font_size", 8))
    axes_lw = float(style.get("axes_linewidth", 0.8))

    apply_cjk_font_rcparams()

    plt.rcParams.update({
        "svg.fonttype": "none",
        "pdf.fonttype": 42,
        "font.size": font_size,
        "axes.titlesize": float(style.get("title_font_size", font_size + 1)),
        "axes.labelsize": font_size,
        "xtick.labelsize": max(font_size - 1, 6),
        "ytick.labelsize": max(font_size - 1, 6),
        "legend.fontsize": max(font_size - 1, 6),
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.linewidth": axes_lw,
        "legend.frameon": bool(style.get("legend_frame", False)),
    })


def get_palette(style: dict[str, Any], n: int) -> list[str]:
    name = str(style.get("palette", "nature"))
    colors = PALETTE_MAP.get(name, DEFAULT_COLORS_NATURE)
    if n <= len(colors):
        return colors[:n]
    out = []
    for i in range(n):
        out.append(colors[i % len(colors)])
    return out


def create_figure(style: dict[str, Any]):
    w = float(style.get("fig_width", 3.5))
    h = float(style.get("fig_height", 2.5))
    return plt.subplots(figsize=(w, h))


def style_axes(ax, style: dict[str, Any], *, grid_axis: str = "y") -> None:
    spine_color = "#cccccc" if style.get("preset") == "agr_journal" else "#767676"
    ax.spines["left"].set_color(spine_color)
    ax.spines["bottom"].set_color(spine_color)

    if style.get("show_grid"):
        if grid_axis == "both":
            ax.grid(alpha=0.25, color="#aaaaaa", linewidth=0.5)
        else:
            ax.grid(axis=grid_axis, alpha=0.25, color="#aaaaaa", linewidth=0.5)
        ax.set_axisbelow(True)

    panel = style.get("panel_label")
    if panel:
        ax.text(
            -0.08, 1.02, str(panel),
            transform=ax.transAxes,
            fontsize=float(style.get("font_size", 8)) + 2,
            fontweight="bold",
            ha="left",
            va="bottom",
        )


def apply_legend(ax, style: dict[str, Any], has_legend: bool) -> None:
    if not has_legend:
        return
    loc = style.get("legend_loc") or "best"
    ax.legend(
        loc=loc,
        frameon=bool(style.get("legend_frame", False)),
        edgecolor="#ddd" if style.get("legend_frame") else "none",
    )


def bar_error_kw(style: dict[str, Any]) -> dict:
    lw = max(float(style.get("axes_linewidth", 0.8)), 0.8)
    return {"elinewidth": lw, "capthick": lw, "capsize": 3 + lw}


def save_figure(fig, output_path: str, style: dict[str, Any]) -> list[str]:
    """保存 PNG 预览 + 可选 SVG/PDF/TIFF。"""
    dpi = int(style.get("dpi", 300))
    formats = style.get("export_formats") or ["png"]
    if isinstance(formats, str):
        formats = [f.strip() for f in formats.split(",") if f.strip()]

    base, ext = os.path.splitext(output_path)
    if not ext:
        ext = ".png"
        output_path = base + ext

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    fig.tight_layout(pad=1.2)

    saved: list[str] = []
    for fmt in formats:
        path = f"{base}.{fmt.lstrip('.')}"
        kw: dict[str, Any] = {"bbox_inches": "tight", "facecolor": "white", "edgecolor": "none"}
        if fmt in ("png", "tif", "tiff", "jpg", "jpeg"):
            kw["dpi"] = dpi
        fig.savefig(path, **kw)
        saved.append(path)

    if "png" not in [f.lstrip(".") for f in formats]:
        fig.savefig(output_path, dpi=dpi, bbox_inches="tight", facecolor="white", edgecolor="none")
        if output_path not in saved:
            saved.append(output_path)

    plt.close(fig)
    return saved
