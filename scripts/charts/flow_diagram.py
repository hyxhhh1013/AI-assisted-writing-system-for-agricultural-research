"""
流程图生成脚本
使用 matplotlib 绘制实验流程/工艺流程图。

用法: python flow_diagram.py --config <json_path> --output <png_path>

config JSON:
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
import math
import sys
import warnings

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch

# 中文字体
plt.rcParams["font.sans-serif"] = ["SimHei", "Microsoft YaHei", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False

# Unicode 上下标 → ASCII（SimHei 字体的 Unicode 上标覆盖不全）
_SUP_MAP = str.maketrans({"²":"2","³":"3","¹":"1","⁰":"0","⁴":"4","⁵":"5","⁶":"6","⁷":"7","⁸":"8","⁹":"9","⁺":"+","⁻":"-","⁼":"="})
_SUB_MAP = str.maketrans({"₂":"2","₃":"3","₁":"1","₀":"0","₄":"4","₅":"5","₆":"6","₇":"7","₈":"8","₉":"9"})

def _nl(text: str) -> str:
    return text.translate(_SUP_MAP).translate(_SUB_MAP)

warnings.filterwarnings("ignore")


def draw_flow_chart(config: dict, output_path: str):
    """绘制流程图"""
    title = _nl(config.get("title", "Flow Chart"))
    direction = config.get("direction", "vertical")
    nodes = config.get("nodes", [])
    edges = config.get("edges", [])
    # 归一化节点和边标签
    for nd in nodes:
        nd["label"] = _nl(nd.get("label", ""))
    for ed in edges:
        if ed.get("label"):
            ed["label"] = _nl(ed["label"])

    if not nodes:
        raise ValueError("至少需要一个节点")

    n = len(nodes)
    cols = config.get("cols", min(n, 3))
    if direction == "horizontal":
        cols = n
    rows = math.ceil(n / cols)

    fig, ax = plt.subplots(figsize=(cols * 3.5, rows * 2.5))
    ax.set_xlim(0, cols)
    ax.set_ylim(0, rows)
    ax.axis("off")
    ax.set_title(title, fontsize=14, fontweight="bold", pad=20)

    node_positions: dict[str, tuple[float, float]] = {}

    # 计算节点位置
    for i, node in enumerate(nodes):
        col = i % cols
        row = rows - 1 - (i // cols)
        x = col + 0.5
        y = row + 0.5
        node_positions[node["id"]] = (x, y)

    # 绘制边
    for edge in edges:
        if edge["from"] not in node_positions or edge["to"] not in node_positions:
            continue
        x1, y1 = node_positions[edge["from"]]
        x2, y2 = node_positions[edge["to"]]

        # 箭头
        dx, dy = x2 - x1, y2 - y1
        dist = math.sqrt(dx ** 2 + dy ** 2)
        if dist == 0:
            continue

        # 缩短起点终点偏移（避免被节点遮挡）
        shrink = 0.25
        sx, sy = dx / dist * shrink, dy / dist * shrink

        ax.annotate(
            "",
            xy=(x2 - sx, y2 - sy),
            xytext=(x1 + sx, y1 + sy),
            arrowprops=dict(
                arrowstyle="->",
                color="#5B7EA8",
                lw=1.8,
                connectionstyle="arc3,rad=0"
            ),
        )

        # 边标签
        label = edge.get("label", "")
        if label:
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2 + 0.15
            ax.text(mx, my, label, fontsize=7, ha="center", va="bottom",
                    color="#5B7EA8", fontstyle="italic",
                    bbox=dict(boxstyle="round,pad=0.15", facecolor="white", edgecolor="none", alpha=0.8))

    # 绘制节点
    node_colors = config.get("colors", {})
    for i, node in enumerate(nodes):
        x, y = node_positions[node["id"]]
        shape = node.get("shape", "box")
        label = node.get("label", "")
        color = node_colors.get(node["id"], config.get("default_color", "#E8F0FE"))

        w, h = 0.6, 0.35
        if shape == "oval":
            ellipse = mpatches.Ellipse((x, y), w, h * 1.2,
                                       facecolor=color, edgecolor="#3B5998", linewidth=1.5)
            ax.add_patch(ellipse)
        elif shape == "diamond":
            diamond = mpatches.Polygon(
                [(x, y + h * 0.8), (x + w * 0.6, y), (x, y - h * 0.8), (x - w * 0.6, y)],
                closed=True, facecolor=color, edgecolor="#3B5998", linewidth=1.5)
            ax.add_patch(diamond)
        else:
            rect = FancyBboxPatch((x - w / 2, y - h / 2), w, h,
                                  boxstyle="round,pad=0.05",
                                  facecolor=color, edgecolor="#3B5998", linewidth=1.5)
            ax.add_patch(rect)

        ax.text(x, y, label, fontsize=9, ha="center", va="center", fontweight="bold")

    plt.tight_layout()
    fig.savefig(output_path, dpi=200, bbox_inches="tight")
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description="Flow Diagram")
    parser.add_argument("--config", required=True, help="JSON 配置路径")
    parser.add_argument("--output", required=True, help="输出 PNG 路径")
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8-sig") as f:
        config = json.load(f)

    try:
        draw_flow_chart(config, args.output)
        result = {"status": "ok", "output": args.output}
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
