"""
通用数据图表生成脚本（matplotlib）
用法: python plot_generic.py --data <csv_path> --config <json_path> --output <png_path>

config JSON 格式:
{
  "chart_type": "bar" | "line" | "scatter" | "pie",
  "title": "图表标题",
  "x_column": "X轴列名",
  "y_column": "Y轴列名",
  "x_label": "X轴标签",
  "y_label": "Y轴标签",
  "color": "#4A90D9"
}
"""

import argparse
import json
import os
import sys
import traceback

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

# 确保能导入同目录下的共享模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plot_utils import load_dataframe  # noqa: E402

# 中文字体支持
plt.rcParams["font.sans-serif"] = ["SimHei", "Microsoft YaHei", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False


def _rgba_to_mpl(rgba_str):
    """将 Chart.js rgba() 转为 matplotlib 可识别的颜色"""
    if not isinstance(rgba_str, str) or not rgba_str.startswith("rgba"):
        return rgba_str
    import re
    m = re.match(r"rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)", rgba_str)
    if not m:
        return rgba_str
    return (int(m.group(1)) / 255, int(m.group(2)) / 255, int(m.group(3)) / 255, float(m.group(4)))


def _plot_inline(labels, datasets, config, output_path):
    """处理内联数据（Chart.js 风格）"""
    chart_type = config.get("chart_type") or config.get("type", "bar")
    title = config.get("title", "")
    x_label = config.get("x_label", "")
    y_label = config.get("y_label", "")
    colors = ["#4A90D9", "#E57373", "#81C784", "#FFB74D", "#64B5F6", "#BA68C8", "#4DB6AC", "#FF8A65"]

    fig, ax = plt.subplots(figsize=(8, 5))
    x_pos = range(len(labels))

    n_datasets = len(datasets)
    bar_width = 0.8 / max(n_datasets, 1)

    for i, ds in enumerate(datasets):
        c = colors[i % len(colors)]
        d = ds.get("data", [])
        label = ds.get("label", "")
        ds_color = _rgba_to_mpl(ds.get("backgroundColor", c))

        if chart_type == "line":
            ax.plot(x_pos, d, color=c, marker="o", linewidth=2, markersize=6, label=label or None)
            ax.fill_between(x_pos, d, alpha=0.1, color=c)
        elif chart_type == "scatter":
            ax.scatter(x_pos, d, c=c, s=60, alpha=0.7, label=label or None)
        else:
            offset = (i - (n_datasets - 1) / 2) * bar_width
            ax.bar([p + offset for p in x_pos], d, width=bar_width * 0.9,
                   color=ds_color, edgecolor="white", linewidth=0.5,
                   label=label or None, alpha=0.85)

    ax.set_xticks(x_pos)
    ax.set_xticklabels(labels, fontsize=9, rotation=20, ha="right")
    if x_label: ax.set_xlabel(x_label, fontsize=12)
    if y_label: ax.set_ylabel(y_label, fontsize=12)
    ax.set_title(title, fontsize=14)
    if len(datasets) > 1: ax.legend(fontsize=10)
    ax.grid(axis="y", alpha=0.3)
    plt.tight_layout()
    fig.savefig(output_path, dpi=200, bbox_inches="tight")
    plt.close(fig)


def plot_chart(data_path: str, config: dict, output_path: str):
    # 支持内联数据（Chart.js 风格）和 CSV 文件两种模式
    inline_data = config.get("data")
    if inline_data and "labels" in inline_data and "datasets" in inline_data:
        labels = inline_data["labels"]
        datasets = inline_data["datasets"]
        return _plot_inline(labels, datasets, config, output_path)

    df = load_dataframe(data_path)
    chart_type = config.get("chart_type", "line")
    title = config.get("title", "")
    x_col = config.get("x_column")
    y_col = config.get("y_column")
    x_label = config.get("x_label", x_col or "")
    y_label = config.get("y_label", y_col or "")
    color = config.get("color", "#4A90D9")

    if not x_col or x_col not in df.columns:
        x_col = df.columns[0]
    if not y_col or y_col not in df.columns:
        y_col = df.columns[1] if len(df.columns) > 1 else df.columns[0]

    x_data = df[x_col].astype(str).tolist()
    y_data = pd.to_numeric(df[y_col], errors="coerce").tolist()

    fig, ax = plt.subplots(figsize=(8, 5))

    if chart_type == "pie":
        wedges, texts, autotexts = ax.pie(
            y_data,
            labels=x_data,
            autopct="%1.1f%%",
            colors=[color],
            startangle=90,
        )
        ax.set_title(title, fontsize=14, pad=20)
    elif chart_type == "scatter":
        x_num = pd.to_numeric(df[x_col], errors="coerce").tolist()
        ax.scatter(x_num, y_data, c=color, s=60, alpha=0.7, edgecolors="black", linewidth=0.5)
        ax.set_xlabel(x_label, fontsize=12)
        ax.set_ylabel(y_label, fontsize=12)
        ax.set_title(title, fontsize=14)
        ax.grid(True, alpha=0.3)
    else:
        bars = ax.bar(x_data, y_data, color=color, edgecolor="white", linewidth=0.5) if chart_type == "bar" else None
        if chart_type == "line":
            ax.plot(x_data, y_data, color=color, marker="o", linewidth=2, markersize=6)
            ax.fill_between(range(len(x_data)), y_data, alpha=0.1, color=color)
        elif chart_type == "bar":
            bars = ax.bar(x_data, y_data, color=color, edgecolor="white", linewidth=0.5)
        ax.set_xlabel(x_label, fontsize=12)
        ax.set_ylabel(y_label, fontsize=12)
        ax.set_title(title, fontsize=14)
        ax.tick_params(axis="x", rotation=45 if len(x_data) > 5 else 0)
        ax.grid(axis="y", alpha=0.3)

    plt.tight_layout()
    fig.savefig(output_path, dpi=200, bbox_inches="tight")
    plt.close(fig)
    print(json.dumps({"status": "ok", "output": output_path}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, help="CSV 数据文件路径")
    parser.add_argument("--config", required=True, help="JSON 配置文件路径")
    parser.add_argument("--output", required=True, help="输出 PNG 路径")
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    try:
        plot_chart(args.data, cfg, args.output)
    except Exception as e:
        err_msg = json.dumps({"status": "error", "message": str(e)})
        print(err_msg)  # to stdout (captured by API)
        print(err_msg, file=sys.stderr)  # to stderr (also captured)
        sys.stderr.flush()
        sys.exit(1)
