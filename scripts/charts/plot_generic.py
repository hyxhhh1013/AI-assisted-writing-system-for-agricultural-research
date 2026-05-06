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
import sys
import traceback

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

# 中文字体支持
plt.rcParams["font.sans-serif"] = ["SimHei", "Microsoft YaHei", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False


def plot_chart(data_path: str, config: dict, output_path: str):
    # 尝试多种编码和分隔符
    df = None
    for encoding in ["utf-8", "utf-8-sig", "gbk", "gb2312", "latin-1"]:
        for sep in [",", "\t", ";"]:
            try:
                df = pd.read_csv(data_path, encoding=encoding, sep=sep)
                if len(df.columns) > 1:
                    break
            except Exception:
                continue
        if df is not None and len(df.columns) > 1:
            break
    if df is None or len(df.columns) == 0:
        df = pd.read_csv(data_path)  # 最后尝试默认方式
    chart_type = config.get("chart_type", "bar")
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
