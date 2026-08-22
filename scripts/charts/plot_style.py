"""
期刊级 matplotlib 样式 — 对照开源 plotstyle / SciencePlots 的刊规思路，
不引入外部包：栏宽(mm)、字号、线宽下限、PDF 字体嵌入、投稿多格式导出与轻量校验。

参考：
- https://github.com/rahulkaushal04/plotstyle （Nature 单栏 89 mm / 双栏 183 mm）
- https://github.com/garrettj403/SciencePlots
"""
from __future__ import annotations

import os
from typing import Any

import matplotlib.pyplot as plt

from font_setup import apply_cjk_font_rcparams

MM_PER_INCH = 25.4

# 常见期刊栏宽（mm）— 与 plotstyle 公开规范对齐
JOURNAL_COLUMN_WIDTH_MM: dict[str, dict[str, float]] = {
    "nature": {"single": 89.0, "double": 183.0, "max_height": 247.0},
    "science": {"single": 55.0, "double": 120.0, "max_height": 247.0},
    "ieee": {"single": 88.9, "double": 181.0, "max_height": 247.0},  # ~3.5 / 7.16 in
    "acs": {"single": 82.5, "double": 178.0, "max_height": 240.0},
    "elsevier": {"single": 90.0, "double": 190.0, "max_height": 240.0},
    "agr_journal": {"single": 80.0, "double": 170.0, "max_height": 240.0},
    # 国内农学刊常见版心（近似，覆盖作物学报 / 农业工程学报类双栏）
    "agr_cn": {"single": 80.0, "double": 165.0, "max_height": 235.0},
}

# nature-figure — 色盲友好、打印清晰
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

PALETTE_PRINT_BW = [
    "#111111", "#444444", "#666666", "#888888",
    "#AAAAAA", "#222222", "#555555", "#777777",
]

# SciencePlots bright — 色盲友好
PALETTE_BRIGHT = [
    "#4477AA", "#EE6677", "#228833", "#CCBB44",
    "#66CCEE", "#AA3377", "#BBBBBB", "#000000",
]

# SciencePlots high-vis
PALETTE_HIGH_VIS = [
    "#0d49fb", "#e6091c", "#26eb47", "#8936df",
    "#fd7800", "#ff58d0", "#3e9fad", "#ffffff",
]

# 柔和 muted（notebook / 多系列）
PALETTE_MUTED = [
    "#CC6677", "#332288", "#DDCC77", "#117733",
    "#88CCEE", "#882255", "#44AA99", "#999933",
]

# Paul Tol bright（色盲安全离散）
PALETTE_TOL = [
    "#4477AA", "#EE6677", "#228833", "#CCBB44",
    "#66CCEE", "#AA3377", "#BBBBBB",
]

# 农业 / 生物质催化语义色：原料→催化→产物→气相
PALETTE_BIOMASS = [
    "#2E7D32",  # feedstock / biomass
    "#1565C0",  # catalyst / metal
    "#EF6C00",  # liquid product / phenolics
    "#6A1B9A",  # aromatics / specialty
    "#00838F",  # deoxygenation / support
    "#5D4037",  # char / solid
    "#78909C",  # light gas
    "#C62828",  # stress / hotspot
]

PALETTE_MAP = {
    "nature": DEFAULT_COLORS_NATURE,
    "agr": PALETTE_AGR,
    "pastel": PALETTE_PASTEL,
    "print_bw": PALETTE_PRINT_BW,
    "bright": PALETTE_BRIGHT,
    "high_vis": PALETTE_HIGH_VIS,
    "muted": PALETTE_MUTED,
    "tol": PALETTE_TOL,
    "biomass": PALETTE_BIOMASS,
}

# IEEE / 灰度打印常用标记循环（SciencePlots 思路）
MARKER_CYCLE = ["o", "s", "^", "D", "v", "P", "X", "*", "h", "<", ">"]
LINESTYLE_CYCLE = ["-", "--", "-.", ":"]


def mm_to_inch(mm: float) -> float:
    return float(mm) / MM_PER_INCH


def journal_fig_width_inch(preset: str, columns: int = 1) -> float:
    """按刊规栏数返回图宽（inch）。"""
    key = preset if preset in JOURNAL_COLUMN_WIDTH_MM else (
        "agr_journal" if preset == "agr_journal" else "nature"
    )
    spec = JOURNAL_COLUMN_WIDTH_MM.get(key, JOURNAL_COLUMN_WIDTH_MM["nature"])
    mm = spec["double"] if int(columns) >= 2 else spec["single"]
    return round(mm_to_inch(mm), 3)


STYLE_PRESETS: dict[str, dict[str, Any]] = {
    "nature": {
        "font_size": 7,
        "title_font_size": 8,
        "axes_linewidth": 0.8,
        "min_linewidth": 0.5,
        "dpi": 300,
        "fig_width": journal_fig_width_inch("nature", 1),  # ~3.50 in = 89 mm
        "fig_height": 2.6,
        "columns": 1,
        "palette": "nature",
        "show_grid": False,
        "legend_frame": False,
        "bar_edge": True,
        "export_formats": ["png", "svg", "pdf"],
        "journal_key": "nature",
        "use_markers": False,
    },
    "agr_journal": {
        "font_size": 9,
        "title_font_size": 10,
        "axes_linewidth": 1.0,
        "min_linewidth": 0.5,
        "dpi": 300,
        "fig_width": journal_fig_width_inch("agr_journal", 2),
        "fig_height": 4.8,
        "columns": 2,
        "palette": "agr",
        "show_grid": True,
        "legend_frame": True,
        "bar_edge": False,
        "export_formats": ["png", "svg", "pdf"],
        "journal_key": "agr_journal",
        "use_markers": True,
    },
    "print_bw": {
        "font_size": 8,
        "title_font_size": 9,
        "axes_linewidth": 1.0,
        "min_linewidth": 0.75,
        "dpi": 600,
        "fig_width": journal_fig_width_inch("nature", 1),
        "fig_height": 2.6,
        "columns": 1,
        "palette": "print_bw",
        "show_grid": False,
        "legend_frame": False,
        "bar_edge": True,
        "export_formats": ["png", "svg", "pdf", "tiff"],
        "journal_key": "nature",
        "use_markers": True,
    },
    "slide": {
        "font_size": 14,
        "title_font_size": 16,
        "axes_linewidth": 1.2,
        "min_linewidth": 0.8,
        "dpi": 200,
        "fig_width": 10.0,
        "fig_height": 6.0,
        "columns": 2,
        "palette": "nature",
        "show_grid": True,
        "legend_frame": True,
        "bar_edge": True,
        "export_formats": ["png"],
        "journal_key": "nature",
        "use_markers": True,
    },
    # SciencePlots「science + ieee」：窄栏、色盲+标记区分、灰度可辨
    "ieee": {
        "font_size": 8,
        "title_font_size": 9,
        "axes_linewidth": 0.8,
        "min_linewidth": 0.75,
        "dpi": 600,
        "fig_width": journal_fig_width_inch("ieee", 1),
        "fig_height": 2.5,
        "columns": 1,
        "palette": "bright",
        "show_grid": False,
        "legend_frame": False,
        "bar_edge": True,
        "export_formats": ["png", "svg", "pdf", "tiff"],
        "journal_key": "ieee",
        "use_markers": True,
    },
    # ACS 化学刊（催化 / 能源材料常用）
    "acs": {
        "font_size": 8,
        "title_font_size": 9,
        "axes_linewidth": 0.9,
        "min_linewidth": 0.5,
        "dpi": 300,
        "fig_width": journal_fig_width_inch("acs", 1),
        "fig_height": 2.6,
        "columns": 1,
        "palette": "biomass",
        "show_grid": False,
        "legend_frame": False,
        "bar_edge": True,
        "export_formats": ["png", "svg", "pdf", "tiff"],
        "journal_key": "acs",
        "use_markers": True,
    },
    # Elsevier 双栏宽图
    "elsevier": {
        "font_size": 8,
        "title_font_size": 9,
        "axes_linewidth": 0.9,
        "min_linewidth": 0.5,
        "dpi": 300,
        "fig_width": journal_fig_width_inch("elsevier", 2),
        "fig_height": 4.5,
        "columns": 2,
        "palette": "tol",
        "show_grid": False,
        "legend_frame": False,
        "bar_edge": True,
        "export_formats": ["png", "svg", "pdf"],
        "journal_key": "elsevier",
        "use_markers": False,
    },
    # 国内农学刊近似
    "agr_cn": {
        "font_size": 9,
        "title_font_size": 10,
        "axes_linewidth": 1.0,
        "min_linewidth": 0.5,
        "dpi": 300,
        "fig_width": journal_fig_width_inch("agr_cn", 2),
        "fig_height": 4.6,
        "columns": 2,
        "palette": "agr",
        "show_grid": True,
        "legend_frame": True,
        "bar_edge": False,
        "export_formats": ["png", "svg", "pdf"],
        "journal_key": "agr_cn",
        "use_markers": True,
    },
}


def resolve_style(config: dict) -> dict[str, Any]:
    """合并 preset + config.style 覆盖项；支持 columns=1|2 自动套刊规栏宽。"""
    raw = config.get("style") if isinstance(config.get("style"), dict) else {}
    # 兼容顶层 preset（流程图 / 机理图）
    preset_name = str(
        raw.get("preset")
        or config.get("style_preset")
        or config.get("preset")
        or "nature"
    ).strip()
    if preset_name not in STYLE_PRESETS:
        preset_name = "nature"
    base = dict(STYLE_PRESETS[preset_name])
    base["preset"] = preset_name

    for key in (
        "font_size", "axes_linewidth", "dpi", "fig_width", "fig_height",
        "palette", "show_grid", "legend_frame", "legend_loc", "bar_edge",
        "panel_label", "show_values", "export_formats", "title_font_size",
        "x_tick_rotation", "y_sci_notation", "columns", "min_linewidth",
        "journal_key", "use_markers",
    ):
        if key in raw and raw[key] is not None and raw[key] != "":
            base[key] = raw[key]
        elif key in (
            "columns", "dpi", "fig_width", "fig_height", "export_formats",
            # 注册表顶层 config 字段（UI/Agent 直接传），需落进 style 才被各类型读取
            "show_values", "bar_edge", "panel_label", "x_tick_rotation",
            "y_sci_notation", "font_size", "palette", "legend_loc",
        ) and key in config:
            if config[key] not in (None, ""):
                base[key] = config[key]

    # columns → 自动栏宽（仅当用户未显式改 fig_width，或同时传了 columns）
    cols_raw = raw.get("columns", config.get("columns", base.get("columns", 1)))
    try:
        cols = int(cols_raw)
    except (TypeError, ValueError):
        cols = 1
    cols = 2 if cols >= 2 else 1
    base["columns"] = cols
    # 若 style 里显式给了 fig_width 则尊重；否则按刊规
    if "fig_width" not in raw and "fig_width" not in config:
        jkey = str(base.get("journal_key") or preset_name)
        base["fig_width"] = journal_fig_width_inch(jkey, cols)

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
    if isinstance(base.get("use_markers"), str):
        base["use_markers"] = base["use_markers"].lower() in ("1", "true", "yes", "on")

    if not base.get("export_formats"):
        base["export_formats"] = ["png", "svg", "pdf"]

    return base


def get_markers(n: int) -> list[str]:
    """SciencePlots / IEEE：系列用不同标记，灰度印刷可辨。"""
    if n <= 0:
        return []
    return [MARKER_CYCLE[i % len(MARKER_CYCLE)] for i in range(n)]


def get_linestyles(n: int) -> list[str]:
    return [LINESTYLE_CYCLE[i % len(LINESTYLE_CYCLE)] for i in range(max(n, 0))]


def _hex_luminance(hex_color: str) -> float:
    h = hex_color.lstrip("#")
    if len(h) != 6:
        return 0.5
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def check_grayscale_safety(colors: list[str], min_delta: float = 0.12) -> list[dict[str, str]]:
    """plotstyle 灰度可辨：相邻色相对亮度差过小则 warn。"""
    if len(colors) < 2:
        return [{"level": "pass", "code": "grayscale", "message": "单色无需灰度检查"}]
    lums = [_hex_luminance(c) for c in colors]
    bad: list[str] = []
    for i in range(len(lums) - 1):
        if abs(lums[i] - lums[i + 1]) < min_delta:
            bad.append(f"{i + 1}/{i + 2}")
    if bad:
        return [{
            "level": "warn",
            "code": "grayscale_close",
            "message": f"相邻系列灰度接近（{', '.join(bad)}），建议开标记或改 bright/tol/print_bw",
        }]
    return [{"level": "pass", "code": "grayscale", "message": "相邻系列灰度差足够"}]


def create_subplots(
    style: dict[str, Any],
    nrows: int = 1,
    ncols: int = 1,
    *,
    panel_labels: bool = True,
    label_case: str = "parens_lower",
):
    """对照 plotstyle.subplots：刊规图幅 + 自动 a/b/c。"""
    cols = int(style.get("columns") or 1)
    w = float(
        style.get("fig_width")
        or journal_fig_width_inch(str(style.get("journal_key") or "nature"), cols)
    )
    base_h = float(style.get("fig_height") or 2.6)
    h = base_h * max(nrows, 1) * (0.85 if nrows > 1 else 1.0)
    fig, axes = plt.subplots(nrows=nrows, ncols=ncols, figsize=(w, h))
    if nrows == 1 and ncols == 1:
        flat = [axes]
    else:
        try:
            flat = list(axes.flat)  # type: ignore[union-attr]
        except AttributeError:
            flat = list(axes) if isinstance(axes, (list, tuple)) else [axes]

    if panel_labels:
        letters = "abcdefghijklmnopqrstuvwxyz"
        for i, ax in enumerate(flat):
            if i >= len(letters):
                break
            ch = letters[i]
            if label_case == "upper":
                text = ch.upper()
            elif label_case == "parens_upper":
                text = f"({ch.upper()})"
            elif label_case == "lower":
                text = ch
            else:
                text = f"({ch})"
            ax.text(
                -0.12,
                1.05,
                text,
                transform=ax.transAxes,
                fontsize=float(style.get("font_size", 8)) + 2,
                fontweight="bold",
                ha="left",
                va="bottom",
            )
    return fig, axes


def apply_publication_style(style: dict[str, Any]) -> None:
    """全局 rcParams — SVG 文字可编辑；PDF TrueType(42)；CJK 字体优先。"""
    font_size = float(style.get("font_size", 8))
    axes_lw = float(style.get("axes_linewidth", 0.8))
    min_lw = float(style.get("min_linewidth", 0.5))

    apply_cjk_font_rcparams()

    plt.rcParams.update({
        "svg.fonttype": "none",       # 可编辑文字
        "pdf.fonttype": 42,           # TrueType，避免 Type 3
        "ps.fonttype": 42,
        "font.size": font_size,
        "axes.titlesize": float(style.get("title_font_size", font_size + 1)),
        "axes.labelsize": font_size,
        "xtick.labelsize": max(font_size - 1, 5),
        "ytick.labelsize": max(font_size - 1, 5),
        "legend.fontsize": max(font_size - 1, 5),
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.linewidth": max(axes_lw, min_lw),
        "lines.linewidth": max(axes_lw, min_lw),
        "patch.linewidth": max(axes_lw * 0.8, min_lw),
        "legend.frameon": bool(style.get("legend_frame", False)),
        "figure.dpi": 100,
        "savefig.dpi": int(style.get("dpi", 300)),
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
    if style.get("preset") == "print_bw":
        spine_color = "#111111"
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
        # Nature 习惯：(a) 在左上
        label = str(panel).strip()
        if label and not label.startswith("("):
            label = f"({label})" if len(label) <= 2 else label
        ax.text(
            -0.12, 1.05, label,
            transform=ax.transAxes,
            fontsize=float(style.get("font_size", 8)) + 2,
            fontweight="bold",
            ha="left",
            va="bottom",
        )


def apply_legend(ax, style: dict[str, Any], has_legend: bool) -> None:
    if not has_legend:
        return
    loc = str(style.get("legend_loc") or "best")
    if loc in ("auto", "none"):
        if loc == "none":
            old = ax.get_legend()
            if old:
                old.remove()
            return
        loc = "best"
    frame = bool(style.get("legend_frame", False))
    kw: dict[str, Any] = {
        "frameon": frame,
        "edgecolor": "#ddd" if frame else "none",
    }
    old = ax.get_legend()
    if old:
        old.remove()
    if loc == "outer-right":
        style["_need_right_margin"] = True
        ax.legend(loc="upper left", bbox_to_anchor=(1.02, 1.0), borderaxespad=0.0, **kw)
        return
    if loc == "outer-bottom":
        style["_need_bottom_margin"] = True
        handles, labels = ax.get_legend_handles_labels()
        ncol = max(1, min(len(labels), 4))
        ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.22), ncol=ncol, **kw)
        return
    ax.legend(loc=loc, **kw)


def bar_error_kw(style: dict[str, Any]) -> dict:
    lw = max(float(style.get("axes_linewidth", 0.8)), float(style.get("min_linewidth", 0.5)))
    return {"elinewidth": lw, "capthick": lw, "capsize": 3 + lw}


def _parse_formats(raw: Any) -> list[str]:
    if isinstance(raw, list):
        formats = [str(x).strip().lower().lstrip(".") for x in raw if str(x).strip()]
    elif isinstance(raw, str) and raw.strip():
        formats = [x.strip().lower().lstrip(".") for x in raw.replace(";", ",").split(",") if x.strip()]
    else:
        formats = ["png", "svg", "pdf"]
    allowed = {"png", "svg", "pdf", "tif", "tiff", "jpg", "jpeg"}
    out: list[str] = []
    seen: set[str] = set()
    for f in formats:
        if f in allowed and f not in seen:
            seen.add(f)
            out.append(f)
    if "png" not in seen:
        out.insert(0, "png")
    return out


def validate_style(style: dict[str, Any], fig=None) -> dict[str, Any]:
    """
    轻量刊规校验（对照 plotstyle.validate 思路）。
    返回 { ok, checks: [{level, code, message}] }；level = pass|warn|fail。
    """
    checks: list[dict[str, str]] = []
    preset = str(style.get("preset") or "nature")
    jkey = str(style.get("journal_key") or preset)
    cols = int(style.get("columns") or 1)
    width_in = float(style.get("fig_width") or 0)
    height_in = float(style.get("fig_height") or 0)
    font_size = float(style.get("font_size") or 0)
    dpi = int(style.get("dpi") or 0)
    axes_lw = float(style.get("axes_linewidth") or 0)
    min_lw = float(style.get("min_linewidth") or 0.5)

    target_w = journal_fig_width_inch(jkey, cols)
    if fig is not None:
        try:
            width_in = float(fig.get_size_inches()[0])
        except Exception:
            pass
    # 宽度容差 ±8%（对照刊规包）
    if width_in <= 0:
        checks.append({"level": "fail", "code": "width_missing", "message": "缺少 fig_width"})
    elif preset != "slide" and target_w > 0 and abs(width_in - target_w) / target_w > 0.08:
        checks.append({
            "level": "fail" if abs(width_in - target_w) / target_w > 0.15 else "warn",
            "code": "width_off_spec",
            "message": f"图宽 {width_in:.2f} in，刊规约 {target_w:.2f} in（{cols} 栏）",
        })
    else:
        checks.append({"level": "pass", "code": "width", "message": f"图宽 {width_in:.2f} in ≈ 刊规"})

    if font_size < 5:
        checks.append({"level": "fail", "code": "font_too_small", "message": f"字号 {font_size} pt 过小"})
    elif font_size < 6 and preset == "nature":
        checks.append({"level": "warn", "code": "font_small", "message": f"字号 {font_size} pt，Nature 建议 ≥6–7 pt"})
    else:
        checks.append({"level": "pass", "code": "font", "message": f"字号 {font_size} pt"})

    if dpi < 300 and preset != "slide":
        checks.append({"level": "warn", "code": "dpi_low", "message": f"DPI={dpi}，投稿建议 ≥300（线稿常要 600）"})
    else:
        checks.append({"level": "pass", "code": "dpi", "message": f"DPI={dpi}"})

    if axes_lw + 1e-9 < min_lw:
        checks.append({
            "level": "warn",
            "code": "linewidth_thin",
            "message": f"轴线 {axes_lw} < 下限 {min_lw}",
        })
    else:
        checks.append({"level": "pass", "code": "linewidth", "message": f"线宽 {axes_lw}"})

    # 高度粗检
    spec = JOURNAL_COLUMN_WIDTH_MM.get(jkey, JOURNAL_COLUMN_WIDTH_MM["nature"])
    max_h_in = mm_to_inch(spec.get("max_height", 247))
    if height_in > max_h_in * 1.05:
        checks.append({
            "level": "warn",
            "code": "height_tall",
            "message": f"图高 {height_in:.2f} in 可能超出单页可用高度",
        })

    # 灰度可辨（对照 plotstyle accessibility）
    n_series = int(style.get("_series_count") or 0)
    if n_series >= 2:
        checks.extend(check_grayscale_safety(get_palette(style, n_series)))
    elif style.get("palette") in ("pastel",):
        checks.append({
            "level": "warn",
            "code": "palette_soft",
            "message": "pastel 配色打印对比偏弱，农学投稿建议 agr / biomass / bright",
        })

    if fig is not None:
        try:
            w_in, h_in = fig.get_size_inches()
            if abs(w_in - width_in) > 0.15:
                checks.append({
                    "level": "warn",
                    "code": "figsize_mismatch",
                    "message": f"实际 figsize 宽 {w_in:.2f} 与 style {width_in:.2f} 不一致",
                })
        except Exception:
            pass

    ok = not any(c["level"] == "fail" for c in checks)
    return {
        "ok": ok,
        "preset": preset,
        "columns": cols,
        "target_width_in": target_w,
        "checks": checks,
    }


def save_figure(fig, output_path: str, style: dict[str, Any]) -> list[str]:
    """保存 PNG + 可选 SVG/PDF/TIFF。不使用 bbox_inches=tight（会裁掉刊宽）。"""
    dpi = int(style.get("dpi", 300))
    formats = _parse_formats(style.get("export_formats"))

    base, ext = os.path.splitext(output_path)
    if not ext:
        ext = ".png"
        output_path = base + ext

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    # 确保 PDF 可编辑字体
    plt.rcParams["pdf.fonttype"] = 42
    plt.rcParams["svg.fonttype"] = "none"

    pad = float(style.get("save_pad_inches", 0.04))
    saved: list[str] = []
    for fmt in formats:
        path = f"{base}.{fmt}"
        kw: dict[str, Any] = {"facecolor": "white", "edgecolor": "none", "pad_inches": pad}
        if fmt in ("png", "tif", "tiff", "jpg", "jpeg"):
            kw["dpi"] = dpi
        fig.savefig(path, **kw)
        saved.append(path)

    if output_path not in saved and os.path.splitext(output_path)[1].lstrip(".").lower() == "png":
        if not os.path.exists(output_path):
            fig.savefig(output_path, dpi=dpi, facecolor="white", edgecolor="none", pad_inches=pad)
        if output_path not in saved:
            saved.append(output_path)

    plt.close(fig)
    return saved


def export_submission(fig, output_stem: str, style: dict[str, Any]) -> dict[str, Any]:
    """
    投稿打包：按刊规默认 png+svg+pdf，并附带 validate 报告。
    output_stem 不含扩展名，或带 .png 均可。
    """
    stem, ext = os.path.splitext(output_stem)
    if not ext:
        png_path = stem + ".png"
    else:
        png_path = stem + ".png" if ext.lower() != ".png" else output_stem
        stem = os.path.splitext(png_path)[0]

    style = dict(style)
    if not style.get("export_formats"):
        style["export_formats"] = ["png", "svg", "pdf"]
    report = validate_style(style, fig)
    saved = save_figure(fig, png_path, style)
    return {"files": saved, "validation": report}
