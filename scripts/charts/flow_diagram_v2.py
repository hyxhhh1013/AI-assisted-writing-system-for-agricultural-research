"""
流程图生成脚本 (Graphviz) — 期刊级排版（白底细线 / 正交边 / 高分导出）。

质量要点（相对旧版）:
- 不再用 ratio=compress 把图硬塞进栏宽（那是糊、挤、变形的主因）
- Nature 向默认：白/浅填色 + 深描边 + 正交折线
- HTML 标签自动换行；节点宽度更一致
- 渲染后按刊规栏宽等比缩放 PNG（不压扁内容）

用法: python flow_diagram_v2.py --config <json_path> --output <png_path>
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import textwrap
from typing import Any

import graphviz

_GRAPHVIZ_CANDIDATES = [
    r"C:\Program Files\Graphviz\bin",
    r"C:\Program Files (x86)\Graphviz\bin",
]


def _ensure_graphviz_on_path() -> None:
    try:
        graphviz.version()
        return
    except Exception:
        pass
    for candidate in _GRAPHVIZ_CANDIDATES:
        dot = os.path.join(candidate, "dot.exe" if os.name == "nt" else "dot")
        if os.path.isfile(dot):
            os.environ["PATH"] = candidate + os.pathsep + os.environ.get("PATH", "")
            os.environ.setdefault("GRAPHVIZ_DOT", dot)
            return


_ensure_graphviz_on_path()


def _pick_font(prefer_cjk: bool) -> str:
    """选系统里更可能有的无衬线字体。"""
    if os.name == "nt":
        if prefer_cjk:
            for name in ("Microsoft YaHei", "SimHei", "SimSun", "Arial"):
                return name  # Graphviz 按名查找；YaHei 优先
        return "Arial"
    if prefer_cjk:
        return "Noto Sans CJK SC"
    return "Helvetica"


# 期刊预设 — 偏 Nature graphical abstract：干净、细线、少「色块感」
PRESETS: dict[str, dict[str, Any]] = {
    "nature": {
        "fontsize_title": "10",
        "fontsize_node": "8",
        "fontsize_edge": "6.5",
        "penwidth": "1.0",
        "nodesep": "0.35",
        "ranksep": "0.48",
        "edge_color": "#333333",
        "bgcolor": "white",
        "dpi": "400",
        "splines": "ortho",
        "arrowhead": "normal",
        "arrowsize": "0.55",
        "node_width": "1.35",
        "node_height": "0.42",
        "fixedsize": "false",
        "shapes": {
            "box": {
                "shape": "box",
                "style": "rounded,filled",
                "fillcolor": "#FFFFFF",
                "color": "#1A1A1A",
                "fontcolor": "#1A1A1A",
            },
            "diamond": {
                "shape": "diamond",
                "style": "filled",
                "fillcolor": "#FAFAFA",
                "color": "#1A1A1A",
                "fontcolor": "#1A1A1A",
            },
            "oval": {
                "shape": "ellipse",
                "style": "filled",
                "fillcolor": "#F7F7F7",
                "color": "#1A1A1A",
                "fontcolor": "#1A1A1A",
            },
        },
        # 语义强调色（仅当节点带 color / role 需要时用浅底）
        "role_fill": {
            "process": "#FFFFFF",
            "decision": "#FFF8F0",
            "start_end": "#F3F8F4",
            "callout": "#F5F5F5",
        },
        "role_stroke": {
            "process": "#0F4D92",
            "decision": "#9A3412",
            "start_end": "#166534",
            "callout": "#555555",
        },
    },
    "agr_journal": {
        "fontsize_title": "11",
        "fontsize_node": "9",
        "fontsize_edge": "7",
        "penwidth": "1.15",
        "nodesep": "0.42",
        "ranksep": "0.55",
        "edge_color": "#2F3E34",
        "bgcolor": "white",
        "dpi": "400",
        "splines": "ortho",
        "arrowhead": "normal",
        "arrowsize": "0.6",
        "node_width": "1.5",
        "node_height": "0.45",
        "fixedsize": "false",
        "shapes": {
            "box": {
                "shape": "box",
                "style": "rounded,filled",
                "fillcolor": "#FFFFFF",
                "color": "#1a5632",
                "fontcolor": "#122820",
            },
            "diamond": {
                "shape": "diamond",
                "style": "filled",
                "fillcolor": "#FFFBF5",
                "color": "#C2410C",
                "fontcolor": "#122820",
            },
            "oval": {
                "shape": "ellipse",
                "style": "filled",
                "fillcolor": "#F4F9F5",
                "color": "#1a5632",
                "fontcolor": "#122820",
            },
        },
        "role_fill": {
            "process": "#FFFFFF",
            "decision": "#FFF7ED",
            "start_end": "#ECFDF5",
            "callout": "#F5F5F4",
        },
        "role_stroke": {
            "process": "#1a5632",
            "decision": "#C2410C",
            "start_end": "#166534",
            "callout": "#57534E",
        },
    },
    "print_bw": {
        "fontsize_title": "10",
        "fontsize_node": "8",
        "fontsize_edge": "6.5",
        "penwidth": "1.35",
        "nodesep": "0.38",
        "ranksep": "0.5",
        "edge_color": "#000000",
        "bgcolor": "white",
        "dpi": "600",
        "splines": "ortho",
        "arrowhead": "normal",
        "arrowsize": "0.55",
        "node_width": "1.4",
        "node_height": "0.42",
        "fixedsize": "false",
        "shapes": {
            "box": {
                "shape": "box",
                "style": "rounded,filled",
                "fillcolor": "#FFFFFF",
                "color": "#000000",
                "fontcolor": "#000000",
            },
            "diamond": {
                "shape": "diamond",
                "style": "filled",
                "fillcolor": "#F0F0F0",
                "color": "#000000",
                "fontcolor": "#000000",
            },
            "oval": {
                "shape": "ellipse",
                "style": "filled",
                "fillcolor": "#FAFAFA",
                "color": "#000000",
                "fontcolor": "#000000",
            },
        },
        "role_fill": {
            "process": "#FFFFFF",
            "decision": "#EEEEEE",
            "start_end": "#F5F5F5",
            "callout": "#FFFFFF",
        },
        "role_stroke": {
            "process": "#000000",
            "decision": "#000000",
            "start_end": "#000000",
            "callout": "#444444",
        },
    },
}

ROLE_TO_SHAPE = {
    "process": "box",
    "decision": "diamond",
    "start_end": "oval",
    "callout": "box",
}


def _escape_xml(text: str) -> str:
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _darken(hex_color: str, factor: float = 0.55) -> str:
    hex_color = hex_color.lstrip("#")
    if len(hex_color) != 6:
        return "#222222"
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    r, g, b = int(r * factor), int(g * factor), int(b * factor)
    return f"#{r:02x}{g:02x}{b:02x}"


def _lighten(hex_color: str, factor: float = 0.88) -> str:
    """把强调色洗成浅底，避免 PPT 色块感。"""
    hex_color = hex_color.lstrip("#")
    if len(hex_color) != 6:
        return "#FFFFFF"
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    r = int(r + (255 - r) * factor)
    g = int(g + (255 - g) * factor)
    b = int(b + (255 - b) * factor)
    return f"#{r:02x}{g:02x}{b:02x}"


def _parse_formats(raw: Any) -> list[str]:
    if isinstance(raw, list):
        formats = [str(x).strip().lower() for x in raw if str(x).strip()]
    elif isinstance(raw, str) and raw.strip():
        formats = [x.strip().lower() for x in raw.replace(";", ",").split(",") if x.strip()]
    else:
        formats = ["png", "svg", "pdf"]
    allowed = {"png", "svg", "pdf"}
    out: list[str] = []
    seen: set[str] = set()
    for f in formats:
        if f in allowed and f not in seen:
            seen.add(f)
            out.append(f)
    if "png" not in seen:
        out.insert(0, "png")
    return out


def _resolve_shape(node: dict[str, Any]) -> str:
    role = str(node.get("role") or "").strip().lower()
    if role in ROLE_TO_SHAPE:
        return ROLE_TO_SHAPE[role]
    shape = str(node.get("shape") or "box").strip().lower()
    if shape in ("box", "oval", "diamond"):
        return shape
    if shape in ("ellipse", "circle"):
        return "oval"
    return "box"


def _html_node_label(
    text: str,
    *,
    accent: str,
    max_chars: int = 16,
    decision: bool = False,
) -> str:
    """
    期刊风节点：白底 + 左侧色条（比实心圆角色块更接近 Nature GA / 机理示意图）。
    decision 仍用普通文字（菱形外形由 shape=diamond 承担）。
    """
    raw = str(text or "").strip() or " "
    if "\n" in raw:
        parts = [p.strip() for p in raw.split("\n") if p.strip()]
    else:
        parts = textwrap.wrap(raw, width=max_chars) or [raw]
    inner = "<BR/>".join(_escape_xml(p) for p in parts)
    if decision:
        return (
            f'<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="4">'
            f'<TR><TD ALIGN="CENTER">{inner}</TD></TR></TABLE>>'
        )
    # 左侧 8px 色条 + 正文
    return (
        f'<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="0" COLOR="#222222" BGCOLOR="white">'
        f'<TR>'
        f'<TD BGCOLOR="{accent}" WIDTH="8"></TD>'
        f'<TD ALIGN="LEFT" CELLPADDING="6"><FONT POINT-SIZE="9" COLOR="#1A1A1A">{inner}</FONT></TD>'
        f'</TR></TABLE>>'
    )


def _contains_cjk(*parts: str) -> bool:
    return any(ord(ch) > 127 for part in parts for ch in part)


def _build_dot(config: dict[str, Any], fmt: str) -> graphviz.Digraph:
    preset_name = str(config.get("preset") or config.get("style_preset") or "nature").strip().lower()
    if preset_name not in PRESETS:
        preset_name = "nature"
    preset = PRESETS[preset_name]

    title = str(config.get("title") or "")
    panel = str(config.get("panel_label") or "").strip()
    if panel:
        title = f"({panel}) {title}".strip() if title else f"({panel})"

    direction = str(config.get("direction") or "vertical").lower()
    # look: journal（默认白底细线）| vivid（保留节点自定义色，但洗成浅底）
    look = str(config.get("look") or "journal").strip().lower()
    splines = str(config.get("splines") or preset.get("splines") or "ortho")

    nodes = config.get("nodes") or []
    edges = config.get("edges") or []
    node_colors = config.get("colors") or {}
    default_color = config.get("default_color")

    # 有边标签时 ortho 会丢标签；自动改用 polyline（仍比 spline 干净）
    has_edge_labels = any(str(e.get("label") or "").strip() for e in edges)
    if splines == "ortho" and has_edge_labels:
        splines = "polyline"

    prefer_cjk = _contains_cjk(title, *[str(n.get("label", "")) for n in nodes])
    fontname = _pick_font(prefer_cjk)

    dot = graphviz.Digraph(name="flowchart", format=fmt, engine="dot")

    # 关键：不设 ratio=compress；size 只作上限，允许自然增高
    graph_attrs: dict[str, str] = {
        "rankdir": "TB" if direction != "horizontal" else "LR",
        "splines": splines,
        "nodesep": str(preset["nodesep"]),
        "ranksep": str(preset["ranksep"]),
        "margin": "0.12",
        "bgcolor": str(preset["bgcolor"]),
        "fontname": fontname,
        "fontsize": str(preset["fontsize_title"]),
        "labelloc": "t",
        "labeljust": "c",
        "dpi": str(preset.get("dpi", "400")),
        "pad": "0.12",
        "newrank": "true",
    }
    if title:
        graph_attrs["label"] = _escape_xml(title)

    try:
        from plot_style import journal_fig_width_inch

        cols = 2 if str(config.get("columns") or config.get("cols") or "1") in ("2", "2.0") else 1
        jkey = "agr_journal" if preset_name == "agr_journal" else "nature"
        w_in = journal_fig_width_inch(jkey, cols)
        # 只限制最大宽度，高度放开；绝不 compress
        graph_attrs["size"] = f"{w_in:.2f},20"
    except Exception:
        graph_attrs["size"] = "3.50,20"

    dot.attr("graph", **graph_attrs)
    dot.attr(
        "node",
        fontname=fontname,
        fontsize=str(preset["fontsize_node"]),
        margin="0.10,0.06",
        penwidth=str(preset["penwidth"]),
        width=str(preset.get("node_width", "1.3")),
        height=str(preset.get("node_height", "0.4")),
    )
    dot.attr(
        "edge",
        fontname=fontname,
        fontsize=str(preset["fontsize_edge"]),
        color=str(preset["edge_color"]),
        arrowhead=str(preset.get("arrowhead", "normal")),
        arrowsize=str(preset.get("arrowsize", "0.55")),
        penwidth=str(float(preset["penwidth"]) * 0.9),
        labelfontcolor="#555555",
    )

    shape_styles: dict[str, dict[str, str]] = preset["shapes"]
    role_fill = preset.get("role_fill") or {}
    role_stroke = preset.get("role_stroke") or {}

    # 终端产物等同层，避免分支高低错落
    terminal_ids = [
        str(n.get("id"))
        for n in nodes
        if str(n.get("role") or "").lower() == "start_end"
        and str(n.get("id"))
        and any(str(e.get("to")) == str(n.get("id")) for e in edges)
        and not any(str(e.get("from")) == str(n.get("id")) for e in edges)
    ]

    for node in nodes:
        nid = str(node.get("id") or "")
        if not nid:
            continue
        label = str(node.get("label") or "")
        role = str(node.get("role") or "process").lower()
        shape_key = _resolve_shape(node)

        accent = str(role_stroke.get(role) or "#0F4D92")
        cid = None
        if isinstance(node_colors, dict):
            cid = node_colors.get(nid)
        if not cid and node.get("color"):
            cid = node.get("color")
        if cid:
            accent = _darken(str(cid), 0.75) if look != "vivid" else str(cid)
        elif default_color and shape_key == "box":
            accent = _darken(str(default_color), 0.7)

        is_decision = shape_key == "diamond" or role == "decision"
        html = _html_node_label(
            label,
            accent=accent,
            max_chars=15 if direction != "horizontal" else 13,
            decision=is_decision,
        )

        if is_decision:
            style = dict(shape_styles.get("diamond", shape_styles["box"]))
            style.update(
                {
                    "penwidth": str(preset["penwidth"]),
                    "fontname": fontname,
                    "fillcolor": "#FFFFFF",
                    "color": accent,
                    "width": "1.1",
                    "height": "0.7",
                    "fixedsize": "false",
                }
            )
            dot.node(nid, html, **style)
        elif role == "start_end" or shape_key == "oval":
            # 起止：仍用椭圆，但白底 + 色描边（更干净）
            style = {
                "shape": "ellipse",
                "style": "filled",
                "fillcolor": "#FFFFFF",
                "color": accent,
                "penwidth": str(float(preset["penwidth"]) + 0.15),
                "fontname": fontname,
            }
            # 椭圆用居中 HTML，无色条
            center = _html_node_label(label, accent=accent, max_chars=14, decision=True)
            dot.node(nid, center, **style)
        else:
            # 过程节点：plaintext + HTML 色条卡片
            style = {
                "shape": "plaintext",
                "fontname": fontname,
                "margin": "0.02,0.02",
            }
            if role == "callout":
                # 虚线感用灰色条
                html = _html_node_label(label, accent="#888888", max_chars=16, decision=False)
            dot.node(nid, html, **style)

    if len(terminal_ids) >= 2:
        with dot.subgraph() as s:
            s.attr(rank="same")
            for tid in terminal_ids:
                s.node(tid)

    for edge in edges:
        frm = str(edge.get("from") or "")
        to = str(edge.get("to") or "")
        if not frm or not to:
            continue
        elabel = edge.get("label")
        attrs: dict[str, str] = {}
        # ortho 下边标签有时挤，给一点距离
        if splines == "ortho":
            attrs["labeldistance"] = "1.2"
            attrs["labelangle"] = "0"
        if elabel:
            dot.edge(frm, to, _escape_xml(str(elabel)), **attrs)
        else:
            dot.edge(frm, to, **attrs)

    return dot


def _fit_png_to_journal_width(png_path: str, config: dict[str, Any], dpi: int) -> None:
    """
    将渲染结果等比缩放到刊规栏宽（英寸×dpi 像素），不压扁。
    若图已更窄则只保证最小清晰度，不强行拉大糊化。
    """
    try:
        from PIL import Image
        from plot_style import journal_fig_width_inch
    except Exception:
        return

    preset_name = str(config.get("preset") or "nature").lower()
    cols = 2 if str(config.get("columns") or config.get("cols") or "1") in ("2", "2.0") else 1
    jkey = "agr_journal" if preset_name == "agr_journal" else "nature"
    target_w_in = journal_fig_width_inch(jkey, cols)
    target_px = int(round(target_w_in * dpi))

    try:
        im = Image.open(png_path)
    except Exception:
        return
    if im.width <= 0:
        return

    # 仅当明显宽于栏宽时缩小；略窄则保留（避免放大糊）
    if im.width > target_px * 1.02:
        scale = target_px / float(im.width)
        new_size = (target_px, max(1, int(round(im.height * scale))))
        im = im.resize(new_size, Image.Resampling.LANCZOS)
        im.save(png_path, dpi=(dpi, dpi))
    else:
        # 写入正确 dpi 元数据，方便排版软件识别物理尺寸
        im.save(png_path, dpi=(dpi, dpi))


def draw_flow_chart(config: dict[str, Any], output_path: str) -> dict[str, str]:
    """渲染主 PNG，并按 export_formats 额外写出 svg/pdf。返回各格式路径。"""
    nodes = config.get("nodes") or []
    if not nodes:
        raise ValueError("至少需要一个节点")

    formats = _parse_formats(config.get("export_formats"))
    output_dir = os.path.dirname(os.path.abspath(output_path)) or "."
    os.makedirs(output_dir, exist_ok=True)
    stem = os.path.splitext(os.path.basename(output_path))[0]
    base_path = os.path.join(output_dir, stem)

    preset_name = str(config.get("preset") or "nature").lower()
    dpi = int(PRESETS.get(preset_name, PRESETS["nature"]).get("dpi", 400))

    paths: dict[str, str] = {}
    for fmt in formats:
        dot = _build_dot(config, fmt)
        rendered = dot.render(base_path, cleanup=True)
        actual = rendered if os.path.exists(rendered) else f"{base_path}.{fmt}"
        target = f"{base_path}.{fmt}" if fmt != "png" else output_path
        if os.path.abspath(actual) != os.path.abspath(target):
            if os.path.exists(target):
                os.remove(target)
            shutil.move(actual, target)
        paths[fmt] = target

    if "png" not in paths or not os.path.exists(output_path):
        dot = _build_dot(config, "png")
        rendered = dot.render(base_path, cleanup=True)
        actual = rendered if os.path.exists(rendered) else f"{base_path}.png"
        if os.path.abspath(actual) != os.path.abspath(output_path):
            if os.path.exists(output_path):
                os.remove(output_path)
            shutil.move(actual, output_path)
        paths["png"] = output_path

    if os.path.exists(output_path):
        _fit_png_to_journal_width(output_path, config, dpi)

    return paths


def main() -> None:
    parser = argparse.ArgumentParser(description="Flow Diagram (Graphviz, journal quality)")
    parser.add_argument("--config", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8-sig") as f:
        config = json.load(f)

    try:
        paths = draw_flow_chart(config, args.output)
        print(
            json.dumps(
                {
                    "status": "ok",
                    "output": args.output,
                    "outputs": paths,
                    "preset": config.get("preset") or "nature",
                },
                ensure_ascii=False,
            )
        )
    except Exception as e:
        import traceback

        print(
            json.dumps(
                {
                    "status": "error",
                    "message": str(e),
                    "traceback": traceback.format_exc(),
                },
                ensure_ascii=False,
            )
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
