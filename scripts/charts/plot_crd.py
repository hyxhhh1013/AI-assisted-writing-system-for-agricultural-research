"""
XRD/CRD 数据图表生成脚本（PyXplore + matplotlib）
用法: python plot_crd.py --data <csv/xyd_path> --config <json_path> --output <png_path>

config JSON 格式:
{
  "title": "XRD 图谱",
  "x_label": "2θ (degree)",
  "y_label": "Intensity (a.u.)",
  "patterns": ["pattern1", "pattern2"],  // 要绘制的数据列
  "colors": ["#4A90D9", "#E57373"],
  "show_peaks": true,
  "peak_labels": true
}
"""

import argparse
import json
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
import numpy as np

# 确保能导入同目录下的共享模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plot_utils import load_dataframe  # noqa: E402

plt.rcParams["font.sans-serif"] = ["SimHei", "Microsoft YaHei", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False

# 尝试导入 PyXplore
try:
    from PyXplore.XRDSimulation import XRDSimulation
    from PyXplore.Plot import plot_xrd_pattern
    HAS_PYXPLORE = True
except ImportError:
    HAS_PYXPLORE = False


def find_peaks(x: np.ndarray, y: np.ndarray, prominence: float = 0.05):
    """简单峰检测"""
    from scipy.signal import find_peaks as sp_find_peaks
    y_norm = (y - y.min()) / (y.max() - y.min() + 1e-10)
    peaks, properties = sp_find_peaks(y_norm, prominence=prominence)
    return peaks, properties


def plot_xrd(data_path: str, config: dict, output_path: str):
    df = load_dataframe(data_path)

    title = config.get("title", "XRD Pattern")
    x_label = config.get("x_label", "2θ (degree)")
    y_label = config.get("y_label", "Intensity (a.u.)")
    patterns = config.get("patterns", [])
    colors = config.get("colors", ["#4A90D9", "#E57373", "#81C784", "#64B5F6"])
    show_peaks = config.get("show_peaks", False)
    peak_labels = config.get("peak_labels", False)

    # 自动检测 X 列（2-theta 相关列名）
    x_col = None
    for candidate in ["2theta", "2θ", "angle", "Angle", "twotheta", x_label]:
        if candidate in df.columns:
            x_col = candidate
            break

    if not x_col:
        x_col = df.columns[0]

    # 如果没有指定 patterns，使用所有数值列（除了 X 列）
    if not patterns:
        patterns = [c for c in df.columns if c != x_col and pd.api.types.is_numeric_dtype(df[c])]

    x_data = pd.to_numeric(df[x_col], errors="coerce").values

    fig, ax = plt.subplots(figsize=(10, 6))

    for i, pattern in enumerate(patterns):
        if pattern not in df.columns:
            continue
        y_data = pd.to_numeric(df[pattern], errors="coerce").values
        color = colors[i % len(colors)]

        if HAS_PYXPLORE and "XRD" in pattern:
            try:
                plot_xrd_pattern(x_data, y_data, ax=ax, label=pattern, color=color)
                continue
            except Exception:
                pass

        ax.plot(x_data, y_data, label=pattern, color=color, linewidth=1.5)

        if show_peaks:
            peaks, props = find_peaks(x_data, y_data)
            ax.plot(x_data[peaks], y_data[peaks], "v", color=color, markersize=6, alpha=0.6)
            if peak_labels:
                for p in peaks[:10]:
                    ax.annotate(
                        f"{x_data[p]:.1f}°",
                        (x_data[p], y_data[p]),
                        textcoords="offset points",
                        xytext=(0, 12),
                        fontsize=7,
                        ha="center",
                        rotation=45,
                    )

    ax.set_xlabel(x_label, fontsize=12)
    ax.set_ylabel(y_label, fontsize=12)
    ax.set_title(title, fontsize=14)
    ax.legend(fontsize=10)
    ax.grid(True, alpha=0.2)

    plt.tight_layout()
    fig.savefig(output_path, dpi=200, bbox_inches="tight")
    plt.close(fig)
    print(json.dumps({"status": "ok", "output": output_path}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, help="XRD 数据文件路径（CSV/XYD）")
    parser.add_argument("--config", required=True, help="JSON 配置文件路径")
    parser.add_argument("--output", required=True, help="输出 PNG 路径")
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    try:
        plot_xrd(args.data, cfg, args.output)
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)
