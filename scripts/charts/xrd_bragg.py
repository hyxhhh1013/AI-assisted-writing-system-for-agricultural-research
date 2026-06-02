"""
布拉格定律优化脚本
使用 PyXplore EMBraggOpt.BraggLawDerivation 优化晶格常数。

用法: python xrd_bragg.py --config <json_path> --output <png_path>

config JSON:
{
  "crystal_system": 1,
  "lattice_init": [4.0, 4.0, 4.0, 90, 90, 90],
  "hkl": [[1,1,1], [2,0,0], [2,2,0], [3,1,1], [2,2,2]],
  "exp_angles": [38.2, 44.4, 64.6, 77.6, 81.8],
  "wavelength": 1.54056,
  "title": "Bragg Optimization - Crystal A"
}
"""
import argparse
import json
import os
import sys
import math
import warnings
from contextlib import redirect_stdout, redirect_stderr

from _shared import normalize_label

warnings.filterwarnings("ignore")

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ase_compat  # noqa: E402, F401

plt.rcParams["font.sans-serif"] = ["Noto Sans CJK JP", "Noto Serif CJK JP", "SimHei", "Microsoft YaHei", "PingFang SC", "Heiti SC", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False
plt.rcParams["font.size"] = 12
plt.rcParams["figure.dpi"] = 200

CRYSTAL_SYSTEMS = {
    1: "Cubic", 2: "Hexagonal", 3: "Tetragonal",
    4: "Orthorhombic", 5: "Rhombohedral", 6: "Monoclinic", 7: "Triclinic",
}


def run_bragg_optimization(config):
    """运行布拉格优化"""
    from PyXplore.EMBraggOpt.BraggLawDerivation import BraggLawDerivation

    crystal_sys = config["crystal_system"]
    lattice_init = config["lattice_init"]
    hkl = config["hkl"]
    exp_angles = config["exp_angles"]
    wavelength = config.get("wavelength", 1.54056)
    subset_number = config.get("subset_number", len(hkl))
    low_bound = config.get("low_bound", 10)
    up_bound = config.get("up_bound", 120)
    tao = config.get("tao", 0.05)

    ini_a, ini_b, ini_c = lattice_init[0], lattice_init[1], lattice_init[2]
    ini_la1, ini_la2, ini_la3 = lattice_init[3], lattice_init[4], lattice_init[5]

    h = [h[0] for h in hkl]
    k = [h[1] for h in hkl]
    l = [h[2] for h in hkl]

    bld = BraggLawDerivation()

    # 计算初始衍射角（Wavelength 应作为 list 传入）
    wl = [wavelength]
    d_list, _, _ = bld.get_d_space(
        crystal_sys, h, k, l,
        ini_a, ini_b, ini_c,
        ini_la1, ini_la2, ini_la3,
    )
    init_angles = bld.get_new_mui(d_list, wl)

    # 执行优化（重定向 stdout/stderr 防止 sympy print/warning 污染）
    with open(os.devnull, "w") as null, redirect_stdout(null), redirect_stderr(null):
        result = bld.OptmialLatticeConstant(
            crystal_sys=crystal_sys,
            old_p1_list=init_angles,
            p1_list=exp_angles,
            subset_number=subset_number,
            low_bound=low_bound,
            up_bound=up_bound,
            lattice_h=h, lattice_k=k, lattice_l=l,
            ini_a=ini_a, ini_b=ini_b, ini_c=ini_c,
            ini_la1=ini_la1, ini_la2=ini_la2, ini_la3=ini_la3,
            wavelength=wl, fixed=False, tao=tao,
        )

    opt_a, opt_b, opt_c = result[0], result[1], result[2]
    opt_la1, opt_la2, opt_la3 = result[3], result[4], result[5]
    opt_angles = result[6]

    return {
        "opt_a": opt_a, "opt_b": opt_b, "opt_c": opt_c,
        "opt_alpha": opt_la1, "opt_beta": opt_la2, "opt_gamma": opt_la3,
        "init_angles": init_angles,
        "opt_angles": opt_angles,
    }


def plot_bragg_result(exp_angles, init_angles, opt_angles, hkl, config, output_path):
    """生成优化对比图"""
    title = normalize_label(config.get("title", "Bragg Optimization"))
    crystal_sys = config["crystal_system"]
    lattice_init = config["lattice_init"]
    sys_name = CRYSTAL_SYSTEMS.get(crystal_sys, f"System {crystal_sys}")

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))

    # Panel 1: 角度对比
    n = min(len(exp_angles), len(init_angles), len(opt_angles))
    indices = np.arange(n)

    ax1.scatter(indices, exp_angles[:n], color="#2C3E50", s=60,
                marker="o", label="Experimental", zorder=5)
    ax1.scatter(indices, init_angles[:n], color="#E74C3C", s=60,
                marker="s", label="Initial (Bragg)", zorder=5)
    ax1.scatter(indices, opt_angles[:n], color="#2980B9", s=60,
                marker="^", label="Optimized", zorder=5)

    for i in range(n):
        ax1.plot([i, i], [init_angles[i], opt_angles[i]],
                 color="#7F8C8D", linewidth=0.5, alpha=0.5)

    ax1.set_xlabel("Peak index")
    ax1.set_ylabel("2θ (degree)")
    ax1.set_title(f"{sys_name} — Angle Comparison", fontsize=12, fontweight="bold")
    ax1.legend(fontsize=9)
    ax1.set_xticks(indices)
    ax1.set_xticklabels([f"{hkl[i][0]}{hkl[i][1]}{hkl[i][2]}" for i in range(n)],
                        fontsize=7, rotation=45)
    ax1.grid(True, alpha=0.15)

    # Panel 2: 误差对比
    exp_arr = np.array(exp_angles[:n])
    init_arr = np.array(init_angles[:n])
    opt_arr = np.array(opt_angles[:n])

    init_errors = np.abs(exp_arr - init_arr)
    opt_errors = np.abs(exp_arr - opt_arr)

    x = np.arange(n)
    w = 0.35
    ax2.bar(x - w/2, init_errors, w, label="Initial error",
            color="#E74C3C", alpha=0.7)
    ax2.bar(x + w/2, opt_errors, w, label="Optimized error",
            color="#2980B9", alpha=0.7)

    ax2.set_xlabel("Peak index")
    ax2.set_ylabel("|Δ2θ| (degree)")
    ax2.set_title("Error Comparison", fontsize=12, fontweight="bold")
    ax2.legend(fontsize=9)
    ax2.set_xticks(x)
    ax2.set_xticklabels([f"{hkl[i][0]}{hkl[i][1]}{hkl[i][2]}" for i in range(n)],
                        fontsize=7, rotation=45)
    ax2.grid(True, alpha=0.15)

    # 统计
    rms_init = round(np.sqrt(np.mean(init_errors ** 2)), 4)
    rms_opt = round(np.sqrt(np.mean(opt_errors ** 2)), 4)

    fig.suptitle(title, fontsize=14, fontweight="bold", y=1.02)

    plt.tight_layout()
    fig.savefig(output_path, dpi=200, bbox_inches="tight")
    plt.close(fig)

    return {"rms_init": rms_init, "rms_opt": rms_opt}


def main():
    parser = argparse.ArgumentParser(description="Bragg Optimization")
    parser.add_argument("--config", required=True, help="JSON 配置路径")
    parser.add_argument("--output", required=True, help="输出 PNG 路径")
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8-sig") as f:
        config = json.load(f)

    try:
        result = run_bragg_optimization(config)
        exp_angles = config["exp_angles"]
        hkl = config["hkl"]
        lattice_init = config["lattice_init"]

        stats = plot_bragg_result(exp_angles, result["init_angles"],
                                  result["opt_angles"], hkl, config, args.output)

        sys_name = CRYSTAL_SYSTEMS.get(config["crystal_system"], "Unknown")

        output = {
            "status": "ok",
            "output": args.output,
            "data": {
                "crystal_system": sys_name,
                "lattice_initial": {
                    "a": lattice_init[0], "b": lattice_init[1], "c": lattice_init[2],
                    "alpha": lattice_init[3], "beta": lattice_init[4], "gamma": lattice_init[5],
                },
                "lattice_optimized": {
                    "a": round(result["opt_a"], 6),
                    "b": round(result["opt_b"], 6),
                    "c": round(result["opt_c"], 6),
                    "alpha": round(result["opt_alpha"], 4),
                    "beta": round(result["opt_beta"], 4),
                    "gamma": round(result["opt_gamma"], 4),
                },
                "n_peaks": len(hkl),
                "rms_init": stats["rms_init"],
                "rms_opt": stats["rms_opt"],
                "improvement_pct": round(
                    (stats["rms_init"] - stats["rms_opt"]) / stats["rms_init"] * 100
                    if stats["rms_init"] > 0 else 0, 2
                ),
            },
        }
        print(json.dumps(output))

    except Exception as e:
        import traceback
        print(json.dumps({"status": "error", "message": str(e),
                          "traceback": traceback.format_exc()}))
        sys.exit(1)


if __name__ == "__main__":
    main()
