"""
流程图生成脚本 (Graphviz 渲染)
使用 Graphviz DOT 引擎绘制实验流程/工艺流程图，输出学术风格矢量图。

用法: python flow_diagram_v2.py --config <json_path> --output <png_path>

config JSON 与旧版 flow_diagram.py 完全兼容:
{
  "title": "实验流程图",
  "direction": "vertical",
  "nodes": [
    {"id": "1", "label": "原料预处理", "shape": "box"},
    {"id": "2", "label": "热解反应", "shape": "box"},
    {"id": "3", "label": "产物分离", "shape": "diamond"},
    {"id": "4", "label": "生物炭", "shape": "oval"},
    {"id": "5", "label": "生物油", "shape": "oval"}
  ],
  "edges": [
    {"from": "1", "to": "2", "label": "500°C"},
    {"from": "2", "to": "3"},
    {"from": "3", "to": "4", "label": "固体"},
    {"from": "3", "to": "5", "label": "液体"}
  ]
}
"""
import argparse
import json
import os
import sys

import graphviz

# ── 学术主题配色 ──
SHAPE_STYLES = {
    "box": {
        "shape": "box",
        "style": "rounded,filled",
        "fillcolor": "#EBF0F7",
        "color": "#2B579A",
        "penwidth": "1.5",
        "fontcolor": "#1A1A1A",
    },
    "diamond": {
        "shape": "diamond",
        "style": "filled",
        "fillcolor": "#FFF3E0",
        "color": "#E67E22",
        "penwidth": "1.5",
        "fontcolor": "#1A1A1A",
    },
    "oval": {
        "shape": "oval",
        "style": "filled",
        "fillcolor": "#E8F5E9",
        "color": "#388E3C",
        "penwidth": "1.5",
        "fontcolor": "#1A1A1A",
    },
}

# 备用配色（按节点 id 覆盖）
NODE_COLORS = {
    "default": ("#EBF0F7", "#2B579A"),
}


def _escape_label(text: str) -> str:
    """转义 DOT 标签中的特殊字符"""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def draw_flow_chart(config: dict, output_path: str):
    title = config.get("title", "流程图")
    direction = config.get("direction", "vertical")
    nodes = config.get("nodes", [])
    edges = config.get("edges", [])
    node_colors = config.get("colors", {})
    default_color = config.get("default_color", "#EBF0F7")

    if not nodes:
        raise ValueError("至少需要一个节点")

    # 创建有向图
    dot = graphviz.Digraph(
        name="flowchart",
        format="png",
        engine="dot",
    )

    # 全局属性
    dot.attr(
        "graph",
        rankdir="TB" if direction == "vertical" else "LR",
        splines="spline",
        nodesep="0.6",
        ranksep="0.8",
        margin="0.3",
        bgcolor="transparent",
        fontname="SimHei",
        fontsize="12",
        label=title,
        labelloc="t",
        labeljust="c",
    )
    dot.attr(
        "node",
        fontname="SimHei",
        fontsize="10",
        margin="0.2,0.1",
    )
    dot.attr(
        "edge",
        fontname="SimHei",
        fontsize="8",
        color="#5B7EA8",
        arrowhead="vee",
        arrowsize="0.8",
    )

    # 添加节点
    for node in nodes:
        nid = node.get("id", "")
        label = node.get("label", "")
        shape = node.get("shape", "box")

        style = SHAPE_STYLES.get(shape, SHAPE_STYLES["box"]).copy()

        # 自定义颜色覆盖
        cid = node_colors.get(nid, "")
        if cid:
            style["fillcolor"] = cid
            # 根据填充色自动调整边框色（压暗 20%）
            style["color"] = _darken(cid)
        elif default_color != "#EBF0F7":
            style["fillcolor"] = default_color
            style["color"] = _darken(default_color)

        dot.node(
            nid,
            _escape_label(label),
            **style,
        )

    # 添加边
    for edge in edges:
        frm = edge.get("from", "")
        to = edge.get("to", "")
        if not frm or not to:
            continue
        label = edge.get("label", "")
        if label:
            dot.edge(frm, to, _escape_label(label))
        else:
            dot.edge(frm, to)

    # 渲染
    output_dir = os.path.dirname(output_path)
    output_stem = os.path.splitext(os.path.basename(output_path))[0]
    # graphviz.render 会自动加 .png 后缀，所以传不带后缀的路径
    base_path = os.path.join(output_dir, output_stem)

    dot.render(base_path, cleanup=True)

    # graphviz.render 输出到 output_path（实际上会在 base_path 加 .png）
    # 确认文件存在
    if not os.path.exists(output_path):
        # graphviz 可能在 base_path + ".png" 处
        actual = base_path + ".png"
        if os.path.exists(actual):
            os.rename(actual, output_path)


def _darken(hex_color: str, factor: float = 0.7) -> str:
    """将 hex 颜色压暗"""
    hex_color = hex_color.lstrip("#")
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    r, g, b = int(r * factor), int(g * factor), int(b * factor)
    return f"#{r:02x}{g:02x}{b:02x}"


def main():
    parser = argparse.ArgumentParser(description="Flow Diagram (Graphviz)")
    parser.add_argument("--config", required=True, help="JSON 配置路径")
    parser.add_argument("--output", required=True, help="输出 PNG 路径")
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8-sig") as f:
        config = json.load(f)

    try:
        draw_flow_chart(config, args.output)
        result = {"status": "ok", "output": args.output}
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        import traceback
        print(json.dumps({
            "status": "error",
            "message": str(e),
            "traceback": traceback.format_exc(),
        }, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
