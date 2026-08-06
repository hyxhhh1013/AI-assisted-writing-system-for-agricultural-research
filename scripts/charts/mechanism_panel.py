"""
多面板机理图合成（a/b/c）— 期刊级 layout。

每栏可含 text / image / callout / flow_subgraph（内嵌 Graphviz）/ molecule 占位说明。
用法: python mechanism_panel.py --config cfg.json --output out.png
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import textwrap
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flow_diagram_v2 import draw_flow_chart  # noqa: E402
from font_setup import apply_cjk_font_rcparams  # noqa: E402

PRESET_COLORS = {
    "nature": {
        "header": "#0F4D92",
        "header_bg": "#F3F6FA",
        "panel_bg": "#FFFFFF",
        "border": "#D0D0D0",
        "text": "#1A1A1A",
        "muted": "#555555",
        "callout_bg": "#F7F9FC",
        "callout_border": "#0F4D92",
        "footnote": "#8B3A3A",
    },
    "agr_journal": {
        "header": "#1a5632",
        "header_bg": "#F0F5F1",
        "panel_bg": "#FFFFFF",
        "border": "#C5D0C8",
        "text": "#122820",
        "muted": "#5A6B62",
        "callout_bg": "#F6F9F6",
        "callout_border": "#1a5632",
        "footnote": "#9B2C2C",
    },
    "print_bw": {
        "header": "#111111",
        "header_bg": "#F2F2F2",
        "panel_bg": "#FFFFFF",
        "border": "#777777",
        "text": "#111111",
        "muted": "#333333",
        "callout_bg": "#F7F7F7",
        "callout_border": "#111111",
        "footnote": "#111111",
    },
}


def _wrapped_lines(text: str, width: int = 42) -> list[str]:
    lines: list[str] = []
    for para in str(text).split("\n"):
        para = para.strip()
        if not para:
            lines.append("")
            continue
        lines.extend(textwrap.wrap(para, width=width) or [para])
    return lines


def _render_flow_subgraph(block: dict[str, Any], preset: str, tmp_dir: str) -> str | None:
    nodes = block.get("nodes") or []
    edges = block.get("edges") or []
    if not nodes:
        return None
    cfg = {
        "title": block.get("title") or "",
        "direction": block.get("direction") or "vertical",
        "nodes": nodes,
        "edges": edges,
        "preset": preset,
        "export_formats": ["png"],
        "panel_label": "",
        "look": "journal",
        "columns": 1,
    }
    out = os.path.join(tmp_dir, f"flow_{abs(hash(json.dumps(cfg, sort_keys=True))) % 10_000_000}.png")
    try:
        draw_flow_chart(cfg, out)
        return out if os.path.exists(out) else None
    except Exception:
        return None


def _draw_panel(ax, panel: dict[str, Any], colors: dict[str, str], preset: str, tmp_dir: str) -> None:
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    ax.set_facecolor(colors["panel_bg"])

    # 细线边框（期刊感，避免厚圆角卡片）
    ax.add_patch(
        Rectangle(
            (0.015, 0.015),
            0.97,
            0.97,
            linewidth=0.8,
            edgecolor=colors["border"],
            facecolor=colors["panel_bg"],
            transform=ax.transAxes,
            clip_on=False,
        )
    )

    label = str(panel.get("id") or panel.get("label") or "").strip()
    title = str(panel.get("title") or "").strip()
    header = f"({label}) {title}".strip() if label else title

    # 顶栏：细底线代替色块条
    ax.plot([0.04, 0.96], [0.90, 0.90], transform=ax.transAxes, color=colors["border"], lw=0.7, solid_capstyle="butt")
    ax.text(
        0.05,
        0.945,
        header or "Panel",
        transform=ax.transAxes,
        fontsize=8.5,
        fontweight="bold",
        color=colors["header"],
        va="center",
        ha="left",
        zorder=2,
    )

    y = 0.87
    blocks = panel.get("blocks") or []
    for block in blocks:
        if y < 0.08:
            break
        btype = str(block.get("type") or "text").lower()
        if btype == "text":
            text = str(block.get("content") or block.get("text") or "")
            if text:
                lines = _wrapped_lines(text, width=36)
                for line in lines:
                    ax.text(
                        0.06,
                        y,
                        line,
                        transform=ax.transAxes,
                        fontsize=7,
                        color=colors["text"],
                        va="top",
                        ha="left",
                        linespacing=1.25,
                    )
                    y -= 0.028
                y -= 0.018
        elif btype == "callout":
            text = str(block.get("content") or block.get("text") or "")
            lines = _wrapped_lines(text, width=34)
            h = 0.035 + 0.028 * max(len(lines), 1)
            ax.add_patch(
                FancyBboxPatch(
                    (0.05, y - h),
                    0.90,
                    h,
                    boxstyle="square,pad=0",
                    linewidth=0.9,
                    edgecolor=colors["callout_border"],
                    facecolor=colors["callout_bg"],
                    transform=ax.transAxes,
                )
            )
            yy = y - 0.018
            for line in lines:
                ax.text(
                    0.07,
                    yy,
                    line,
                    transform=ax.transAxes,
                    fontsize=6.5,
                    color=colors["text"],
                    va="top",
                    ha="left",
                )
                yy -= 0.026
            y -= h + 0.025
        elif btype == "image":
            path = str(block.get("path") or block.get("image_path") or "")
            caption = str(block.get("caption") or "")
            if path and os.path.isfile(path):
                try:
                    img = Image.open(path).convert("RGBA")
                    h = float(block.get("height") or 0.30)
                    h = max(0.14, min(h, 0.48))
                    ax_img = ax.inset_axes([0.08, y - h, 0.84, h])
                    ax_img.imshow(img, interpolation="lanczos")
                    ax_img.axis("off")
                    for spine in ax_img.spines.values():
                        spine.set_visible(True)
                        spine.set_linewidth(0.4)
                        spine.set_edgecolor(colors["border"])
                    y -= h + 0.015
                    if caption:
                        ax.text(
                            0.5,
                            y,
                            caption,
                            transform=ax.transAxes,
                            fontsize=6,
                            color=colors["muted"],
                            ha="center",
                            va="top",
                        )
                        y -= 0.032
                except Exception:
                    ax.text(
                        0.06,
                        y,
                        f"[image missing: {os.path.basename(path)}]",
                        transform=ax.transAxes,
                        fontsize=6.5,
                        color=colors["footnote"],
                        va="top",
                    )
                    y -= 0.045
            else:
                # 占位框（干净虚线）
                h = 0.16
                ax.add_patch(
                    FancyBboxPatch(
                        (0.08, y - h),
                        0.84,
                        h,
                        boxstyle="square,pad=0",
                        linewidth=0.7,
                        linestyle=(0, (2, 2)),
                        edgecolor=colors["border"],
                        facecolor="#FAFAFA",
                        transform=ax.transAxes,
                    )
                )
                ax.text(
                    0.5,
                    y - h / 2,
                    "Upload figure asset",
                    transform=ax.transAxes,
                    fontsize=6.5,
                    color=colors["muted"],
                    ha="center",
                    va="center",
                    style="italic",
                )
                y -= h + 0.03
        elif btype == "molecule":
            smiles = str(block.get("smiles") or "")
            mlabel = str(block.get("label") or "molecule")
            ax.text(
                0.06,
                y,
                f"{mlabel}" + (f"  ·  {smiles}" if smiles else ""),
                transform=ax.transAxes,
                fontsize=6.5,
                color=colors["muted"],
                va="top",
                family="monospace",
            )
            y -= 0.055
        elif btype in ("flow_subgraph", "flow"):
            flow_png = _render_flow_subgraph(block, preset, tmp_dir)
            h = float(block.get("height") or 0.42)
            h = max(0.22, min(h, 0.58))
            if flow_png and os.path.isfile(flow_png):
                img = Image.open(flow_png).convert("RGBA")
                ax_img = ax.inset_axes([0.04, y - h, 0.92, h])
                ax_img.imshow(img, interpolation="lanczos")
                ax_img.axis("off")
                y -= h + 0.02
            else:
                ax.text(0.06, y, "[flow subgraph]", transform=ax.transAxes, fontsize=6.5, color=colors["muted"], va="top")
                y -= 0.045
        else:
            y -= 0.015

    footnote = str(panel.get("footnote") or "").strip()
    if footnote:
        ax.text(
            0.06,
            0.035,
            footnote,
            transform=ax.transAxes,
            fontsize=6,
            color=colors["footnote"],
            va="bottom",
            ha="left",
            style="italic",
        )


def compose_mechanism_panel(config: dict[str, Any], output_path: str) -> dict[str, Any]:
    apply_cjk_font_rcparams()
    preset = str(config.get("preset") or "nature").lower()
    if preset not in PRESET_COLORS:
        preset = "nature"
    colors = PRESET_COLORS[preset]
    panels = config.get("panels") or []
    if not panels:
        raise ValueError("至少需要一个 panel")

    from plot_style import journal_fig_width_inch  # noqa: E402

    n = len(panels)
    preset_key = "agr_journal" if preset == "agr_journal" else "nature"
    if config.get("fig_width"):
        fig_w = float(config["fig_width"])
    elif n <= 1:
        fig_w = journal_fig_width_inch(preset_key, 1)
    elif n == 2:
        fig_w = journal_fig_width_inch(preset_key, 2)
    else:
        # 三栏 graphical abstract：略宽于双栏，仍保持投稿可缩
        fig_w = journal_fig_width_inch(preset_key, 2) * 1.08
    fig_h = float(config.get("fig_height") or (5.6 if n >= 3 else 4.0))
    dpi = int(config.get("dpi") or (600 if preset == "print_bw" else 400))

    fig, axes = plt.subplots(1, n, figsize=(fig_w, fig_h), dpi=100)
    if n == 1:
        axes = [axes]

    with tempfile.TemporaryDirectory() as tmp_dir:
        for ax, panel in zip(axes, panels):
            _draw_panel(ax, panel, colors, preset, tmp_dir)

        title = str(config.get("title") or "").strip()
        if title:
            fig.suptitle(
                title,
                fontsize=10,
                fontweight="bold",
                color=colors["text"],
                y=0.995,
            )
        fig.subplots_adjust(
            left=0.02,
            right=0.98,
            top=0.93 if title else 0.98,
            bottom=0.03,
            wspace=0.045,
        )
        os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)
        fig.savefig(output_path, dpi=dpi, bbox_inches="tight", facecolor="white", pad_inches=0.05)
        stem = os.path.splitext(output_path)[0]
        outputs = {"png": output_path}
        for fmt in ("svg", "pdf"):
            alt = f"{stem}.{fmt}"
            try:
                fig.savefig(alt, dpi=dpi, bbox_inches="tight", facecolor="white", pad_inches=0.05)
                outputs[fmt] = alt
            except Exception:
                pass
        plt.close(fig)

    return {"outputs": outputs, "n_panels": n, "preset": preset}


def main() -> None:
    parser = argparse.ArgumentParser(description="Mechanism multi-panel composer")
    parser.add_argument("--config", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8-sig") as f:
        config = json.load(f)

    try:
        meta = compose_mechanism_panel(config, args.output)
        print(json.dumps({"status": "ok", "output": args.output, **meta}, ensure_ascii=False))
    except Exception as e:
        import traceback

        print(
            json.dumps(
                {"status": "error", "message": str(e), "traceback": traceback.format_exc()},
                ensure_ascii=False,
            )
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
