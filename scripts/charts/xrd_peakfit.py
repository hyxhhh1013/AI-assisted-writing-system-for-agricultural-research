"""
XRD 峰分解 + 背景扣除 Python 脚本
使用 PyXplore BacDeduct.TwiceFilter 进行背景扣除，
scipy 峰检测 + matplotlib 出版级绘图。

用法: python xrd_peakfit.py --data <csv_path> --config <json_path> --output <png_path>

config JSON:
{
  "title": "XRD Pattern",
  "x_label": "2θ (degree)",
  "y_label": "Intensity (a.u.)",
  "bg_params": {
    "LFctg": 0.5,
    "bac_split": 5,
    "window_length": 17,
    "polyorder": 3,
    "bac_var_type": "constant"
  },
  "peak_params": {
    "prominence": 0.02,
    "min_height": 0.05,
    "max_peaks": 20
  },
  "phase_label": "Sample A"
}
"""
import argparse
import json
import os
import sys
import tempfile
import shutil
import warnings
from contextlib import redirect_stdout, redirect_stderr

from _shared import normalize_label

warnings.filterwarnings("ignore")

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.signal import find_peaks

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plot_utils import load_dataframe  # noqa: E402
import ase_compat  # noqa: E402, F401

plt.rcParams["font.sans-serif"] = ["Noto Sans CJK JP", "Noto Serif CJK JP", "SimHei", "Microsoft YaHei", "PingFang SC", "Heiti SC", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False
plt.rcParams["font.size"] = 12
plt.rcParams["figure.dpi"] = 200


def run_background_subtraction(x, y, work_dir, params):
    """使用 PyXplore BacDeduct.TwiceFilter 进行背景扣除（数据点少时使用多项式拟合）"""
    # 数据点太少时 BacDeduct 无法选择背景点
    min_points = 20
    if len(x) < min_points:
        # 使用简单的多项式拟合做背景
        poly_n = params.get("poly_n", 3)
        coeffs = np.polyfit(x, y, poly_n)
        bg_curve = np.polyval(coeffs, x)
        bg_intensity = y - bg_curve
        bg_intensity = np.abs(bg_intensity)
        return bg_intensity, bg_curve, 0.0

    from PyXplore.Background.BacDeduct import TwiceFilter

    df = pd.DataFrame({"angle": x, "intensity": y})

    tf = TwiceFilter(Model="XRD", work_dir=work_dir)
    # 重定向 stdout/stderr 防止 BacDeduct 的 print/warning 污染输出
    with open(os.devnull, "w") as null, redirect_stdout(null), redirect_stderr(null):
        std_dev = tf.FFTandSGFilter(
            intensity_csv=df,
            LFctg=params.get("LFctg", 0.5),
            bac_split=params.get("bac_split", 5),
            window_length=params.get("window_length", 17),
            polyorder=params.get("polyorder", 3),
            bac_var_type=params.get("bac_var_type", "constant"),
        )

    # 读取背景扣除后的数据
    no_bac_path = os.path.join(work_dir, "ConvertedDocuments", "no_bac_intensity.csv")
    bg_path = os.path.join(work_dir, "ConvertedDocuments", "bac.csv")

    if os.path.exists(no_bac_path):
        no_bac_df = pd.read_csv(no_bac_path, header=None, names=["angle", "intensity"])
        bg_intensity = no_bac_df["intensity"].values
    else:
        bg_intensity = None

    if os.path.exists(bg_path):
        bg_df = pd.read_csv(bg_path, header=None, names=["angle", "intensity"])
        bg_curve = bg_df["intensity"].values
    else:
        bg_curve = None

    return bg_intensity, bg_curve, std_dev


def find_xrd_peaks(x, y, params):
    """检测 XRD 衍射峰"""
    y_min, y_max = y.min(), y.max()
    y_range = y_max - y_min
    if y_range == 0:
        return np.array([]), {}

    prominence = params.get("prominence", 0.02) * y_range
    min_height = params.get("min_height", 0.05) * y_range
    max_peaks = params.get("max_peaks", 20)

    peaks, properties = find_peaks(
        y,
        prominence=prominence,
        height=min_height,
        distance=max(1, len(x) // 200),
    )

    # 按强度排序取前 N 个
    if len(peaks) > max_peaks:
        heights = properties["peak_heights"]
        top_indices = np.argsort(heights)[-max_peaks:]
        peaks = peaks[top_indices]
        peaks.sort()

    return peaks, properties


def plot_xrd_result(x, y_orig, bg_intensity, bg_curve, peaks, config, output_path):
    """生成出版级 XRD 双面板图"""
    title = normalize_label(config.get("title", "XRD Pattern"))
    x_label = normalize_label(config.get("x_label", "2θ (degree)"))
    y_label = normalize_label(config.get("y_label", "Intensity (a.u.)"))
    phase_label = normalize_label(config.get("phase_label", ""))

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 8), sharex=True,
                                    gridspec_kw={"height_ratios": [1.5, 1]})

    color_orig = "#2C3E50"
    color_bg = "#E74C3C"
    color_sub = "#2980B9"
    color_peak = "#E67E22"

    # === Panel 1: Original + Background Curve ===
    ax1.plot(x, y_orig, color=color_orig, linewidth=1.2, label="Experimental")
    if bg_curve is not None:
        ax1.plot(x, bg_curve, color=color_bg, linewidth=1.5,
                 linestyle="--", label="Background", alpha=0.8)

    # mark background points if available
    bg_points_path = os.path.join(
        os.path.dirname(output_path) or ".",
        "..", "..", ".tmp"
    )
    # background points are saved by TwiceFilter; we show peaks on panel 2

    ax1.set_ylabel(y_label, fontsize=12)
    ax1.set_title(title, fontsize=14, fontweight="bold")
    ax1.legend(fontsize=10, loc="upper right")
    ax1.grid(True, alpha=0.15)

    # === Panel 2: Background-subtracted + Peaks ===
    if bg_intensity is not None:
        ax2.plot(x, bg_intensity, color=color_sub, linewidth=1.2, label="Background subtracted")
    else:
        ax2.plot(x, y_orig, color=color_sub, linewidth=1.2, label="Raw (no background subtraction)")

    # 标记峰位
    if len(peaks) > 0:
        peak_y = bg_intensity[peaks] if bg_intensity is not None else y_orig[peaks]
        ax2.plot(x[peaks], peak_y, "v", color=color_peak, markersize=8, alpha=0.8,
                 label=f"Peaks ({len(peaks)})", zorder=5)

        # 标注前 10 个最强峰的 2θ
        heights = peak_y
        top_n = min(10, len(peaks))
        top_idx = np.argsort(heights)[-top_n:]
        for idx in top_idx:
            p = peaks[idx]
            ax2.annotate(
                f"{x[p]:.2f}°",
                (x[p], peak_y[idx]),
                textcoords="offset points",
                xytext=(0, 18),
                fontsize=7,
                ha="center",
                rotation=45,
                color=color_peak,
                fontweight="bold",
                bbox=dict(boxstyle="round,pad=0.2", facecolor="white", alpha=0.7),
            )

    ax2.set_xlabel(x_label, fontsize=12)
    ax2.set_ylabel(y_label, fontsize=12)
    ax2.legend(fontsize=10, loc="upper right")
    ax2.grid(True, alpha=0.15)

    if phase_label:
        fig.suptitle(phase_label, fontsize=10, y=1.01, style="italic",
                     color="gray")

    plt.tight_layout()
    fig.savefig(output_path, dpi=200, bbox_inches="tight")
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description="XRD Peak Fitting")
    parser.add_argument("--data", required=True, help="XRD 数据文件路径")
    parser.add_argument("--config", required=True, help="JSON 配置路径")
    parser.add_argument("--output", required=True, help="输出 PNG 路径")
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8-sig") as f:
        config = json.load(f)

    # 加载数据
    df = load_dataframe(args.data)

    # 自动检测角度列
    x_col = None
    for candidate in ["2theta", "2θ", "angle", "twotheta", "Angle", "2Theta", "2-theta"]:
        if candidate in df.columns:
            x_col = candidate
            break
    if not x_col:
        x_col = df.columns[0]

    # 自动检测强度列（第一个非角度数值列）
    y_col = None
    for c in df.columns:
        if c != x_col and pd.api.types.is_numeric_dtype(df[c]):
            y_col = c
            break
    if not y_col:
        y_col = df.columns[1] if len(df.columns) > 1 else df.columns[0]

    x = pd.to_numeric(df[x_col], errors="coerce").values
    y = pd.to_numeric(df[y_col], errors="coerce").values

    # 去除 NaN
    mask = ~(np.isnan(x) | np.isnan(y))
    x, y = x[mask], y[mask]

    # 使用临时工作目录
    work_dir = tempfile.mkdtemp(prefix="xrd_peakfit_")
    try:
        bg_params = config.get("bg_params", {})
        peak_params = config.get("peak_params", {})

        bg_intensity, bg_curve, std_dev = run_background_subtraction(x, y, work_dir, bg_params)

        # 在背景扣除数据上找峰
        signal = bg_intensity if bg_intensity is not None else y
        peaks, props = find_xrd_peaks(x, signal, peak_params)

        # 生成图谱
        plot_xrd_result(x, y, bg_intensity, bg_curve, peaks, config, args.output)

        # 构造输出 JSON
        peak_list = []
        if len(peaks) > 0:
            peak_heights = signal[peaks]
            sorted_indices = np.argsort(x[peaks])
            for idx in sorted_indices:
                p = peaks[idx]
                peak_list.append({
                    "two_theta": round(float(x[p]), 3),
                    "intensity": round(float(signal[p]), 3),
                    "relative_intensity": round(float(signal[p] / signal[peaks].max() * 100), 2),
                })

        result = {
            "status": "ok",
            "output": args.output,
            "data": {
                "n_peaks": len(peak_list),
                "peaks": peak_list,
                "bg_std_dev": round(float(std_dev), 6) if std_dev is not None else None,
                "bg_params": bg_params,
            },
        }
        print(json.dumps(result))

    except Exception as e:
        result = {"status": "error", "message": str(e)}
        print(json.dumps(result))
        sys.exit(1)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
