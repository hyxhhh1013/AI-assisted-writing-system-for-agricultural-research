"""
非晶态分析脚本
使用 PyXplore Amorphous_fitting 对 XRD 非晶态数据进行高斯混合分解。

用法: python xrd_amorphous.py --data <csv_path> --config <json_path> --output <png_path>

config JSON:
{
  "mix_component": 3,
  "sigma2_coef": 5,
  "max_iter": 5000,
  "ang_range": [10, 80],
  "peak_location": null,
  "title": "Amorphous Decomposition"
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

warnings.filterwarnings("ignore")

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plot_utils import load_dataframe  # noqa: E402
import ase_compat  # noqa: E402, F401

plt.rcParams["font.sans-serif"] = ["SimHei", "Microsoft YaHei", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False
plt.rcParams["font.size"] = 12
plt.rcParams["figure.dpi"] = 200


def run_amorphous_fitting(x, y, config, work_dir):
    """运行非晶态拟合"""
    from PyXplore.Amorphous.fitting.AmorphousFitting import Amorphous_fitting

    mix_component = config.get("mix_component", 3)
    sigma2_coef = config.get("sigma2_coef", 5)
    max_iter = config.get("max_iter", 5000)
    peak_location = config.get("peak_location")
    wavelength = config.get("wavelength", 1.54184)
    ang_range = config.get("ang_range")

    # 保存数据到临时 CSV（Amorphous_fitting 从文件读取）
    temp_csv = os.path.join(work_dir, "upbackground.csv")
    df = pd.DataFrame({"ang": x, "int": y})
    df.to_csv(temp_csv, header=False, index=False)

    # 创建 DecomposedComponents 目录结构
    dc_dir = os.path.join(work_dir, "DecomposedComponents")
    os.makedirs(dc_dir, exist_ok=True)

    # 运行拟合（重定向 stdout/stderr 防止 PyXplore print/warning 污染）
    with open(os.devnull, "w") as null, redirect_stdout(null), redirect_stderr(null):
        Amorphous_fitting(
            mix_component=mix_component,
            amor_file=temp_csv,
            ang_range=ang_range,
            sigma2_coef=sigma2_coef,
            max_iter=max_iter,
            peak_location=peak_location,
            Wavelength=wavelength,
            work_dir=work_dir,
        )

    # 读取拟合结果
    peaks_csv = os.path.join(dc_dir, "M_Amorphous_peaks.csv")
    components = []
    rp_value = None

    if os.path.exists(peaks_csv):
        with open(peaks_csv, "r") as f:
            lines = f.readlines()
        if len(lines) > 0:
            header = lines[0].strip()
            if "Rp" in header:
                rp_str = header.split("Rp:")[1].strip()
                try:
                    rp_value = float(rp_str)
                except ValueError:
                    pass
        for line in lines[1:]:
            parts = line.strip().split(",")
            if len(parts) >= 3:
                components.append({
                    "weight": float(parts[0]),
                    "mu_2theta": float(parts[1]),
                    "sigma2": float(parts[2]),
                })

    # 读取拟合曲线
    fit_csv = os.path.join(dc_dir, "Amorphous.csv")
    fit_x, fit_y = None, None
    if os.path.exists(fit_csv):
        fit_df = pd.read_csv(fit_csv, header=None, names=["ang", "int"])
        fit_x = fit_df["ang"].values
        fit_y = fit_df["int"].values

    return components, rp_value, fit_x, fit_y


def plot_amorphous_result(x, y, fit_x, fit_y, components, config, output_path):
    """生成非晶态分解图"""
    title = config.get("title", "Amorphous Decomposition")
    x_label = config.get("x_label", "2θ (degree)")
    y_label = config.get("y_label", "Intensity (a.u.)")

    fig, ax = plt.subplots(figsize=(10, 6))

    # 原始数据
    ax.plot(x, y, color="#2C3E50", linewidth=1.0, alpha=0.7, label="Experimental")

    # 拟合总曲线
    if fit_x is not None and fit_y is not None:
        ax.plot(fit_x, fit_y, color="#E74C3C", linewidth=1.8,
                linestyle="--", label="Amorphous fit")

    # 各个组分
    component_colors = ["#2980B9", "#27AE60", "#F39C12", "#8E44AD",
                        "#1ABC9C", "#D35400", "#2C3E50", "#7F8C8D"]
    for i, comp in enumerate(components):
        color = component_colors[i % len(component_colors)]
        comp_y = comp["weight"] * np.exp(-(x - comp["mu_2theta"])**2 / (2 * comp["sigma2"]))
        ax.plot(x, comp_y, color=color, linewidth=1.2, alpha=0.8,
                label=f"Peak {i+1}: {comp['mu_2theta']:.1f}°")

    ax.set_xlabel(x_label, fontsize=12)
    ax.set_ylabel(y_label, fontsize=12)
    ax.set_title(title, fontsize=14, fontweight="bold")
    ax.legend(fontsize=9, loc="upper right")
    ax.grid(True, alpha=0.15)

    plt.tight_layout()
    fig.savefig(output_path, dpi=200, bbox_inches="tight")
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description="Amorphous Analysis")
    parser.add_argument("--data", required=True, help="XRD 数据文件路径")
    parser.add_argument("--config", required=True, help="JSON 配置路径")
    parser.add_argument("--output", required=True, help="输出 PNG 路径")
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8-sig") as f:
        config = json.load(f)

    # 加载数据
    df = load_dataframe(args.data)

    x_col = None
    for c in ["2theta", "2θ", "angle", "twotheta", "Angle"]:
        if c in df.columns:
            x_col = c
            break
    if not x_col:
        x_col = df.columns[0]

    y_col = None
    for c in df.columns:
        if c != x_col and pd.api.types.is_numeric_dtype(df[c]):
            y_col = c
            break
    if not y_col:
        y_col = df.columns[1] if len(df.columns) > 1 else df.columns[0]

    x = pd.to_numeric(df[x_col], errors="coerce").values
    y = pd.to_numeric(df[y_col], errors="coerce").values

    mask = ~(np.isnan(x) | np.isnan(y))
    x, y = x[mask], y[mask]

    work_dir = tempfile.mkdtemp(prefix="xrd_amorphous_")
    try:
        components, rp_value, fit_x, fit_y = run_amorphous_fitting(x, y, config, work_dir)

        plot_amorphous_result(x, y, fit_x, fit_y, components, config, args.output)

        # 估计原子间距离 (d = 1.23λ / 2sin(θ))
        wavelength = config.get("wavelength", 1.54184)
        interatomic_dist = None
        if components:
            mu0 = components[0].get("mu_2theta")
            if mu0:
                interatomic_dist = round(1.23 * wavelength / (2 * np.sin(np.radians(mu0 / 2))), 4)

        result = {
            "status": "ok",
            "output": args.output,
            "data": {
                "n_components": len(components),
                "components": components,
                "rp_factor": rp_value,
                "interatomic_distance": interatomic_dist,
            },
        }
        print(json.dumps(result))

    except Exception as e:
        import traceback
        print(json.dumps({"status": "error", "message": str(e),
                          "traceback": traceback.format_exc()}))
        sys.exit(1)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
