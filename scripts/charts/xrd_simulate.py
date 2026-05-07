"""
XRD 模拟脚本
使用 PyXplore XRDSimulation.XRD_profile 从 CIF 模拟 XRD 图谱。

用法: python xrd_simulate.py --cif <cif_path> --config <json_path> --output <png_path>

config JSON:
{
  "wavelength": "CuKa",
  "two_theta_range": [10, 90, 0.02],
  "grain_size": null,
  "super_cell": false,
  "periodic_arr": [3, 3, 3],
  "zero_shift": null,
  "thermo_vib": null,
  "orientation": null,
  "background": false,
  "title": "XRD Simulation"
}
"""
import argparse
import json
import os
import sys
import warnings
from contextlib import redirect_stdout, redirect_stderr

import matplotlib
matplotlib.use("Agg")

warnings.filterwarnings("ignore")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ase_compat  # noqa: E402, F401


def run_simulation(cif_path, config, output_path):
    """运行 XRD 模拟"""
    from PyXplore.XRDSimulation.Simulation import XRD_profile

    wavelength = config.get("wavelength", "CuKa")
    two_theta_range = config.get("two_theta_range", [10, 90, 0.02])
    grain_size = config.get("grain_size")
    super_cell = config.get("super_cell", False)
    periodic_arr = config.get("periodic_arr", [3, 3, 3])
    zero_shift = config.get("zero_shift")
    thermo_vib = config.get("thermo_vib")
    orientation = config.get("orientation")
    background = config.get("background", False)

    # PyXplore 依赖文件名格式（取 [-11:-4] 作为标识符），使用短文件名
    short_cif = os.path.join(os.path.dirname(cif_path), "a.cif")
    if short_cif != cif_path:
        import shutil
        shutil.copy2(cif_path, short_cif)
        cif_path = short_cif

    # 初始化模拟
    simulator = XRD_profile(
        filepath=cif_path,
        wavelength=wavelength,
        two_theta_range=tuple(two_theta_range),
        SuperCell=super_cell,
        PeriodicArr=periodic_arr,
        GrainSize=grain_size,
        PeakWidth=True,
    )

    # 运行模拟（重定向输出）
    with open(os.devnull, "w") as null, redirect_stdout(null), redirect_stderr(null):
        _, x_sim, y_sim = simulator.Simulate(
            plot=True,
            write_in=True,
            orientation=orientation,
            thermo_vib=thermo_vib,
            zero_shift=zero_shift,
            bacI=background,
        )

    # 模拟已经保存了图片到 Simfolder，我们需要读取并重新保存到 output_path
    # Simfolder 是 simulation_WPEM/ 目录
    sim_folder = simulator.Simfolder
    cif_base = os.path.splitext(os.path.basename(cif_path))[0]
    sim_png = os.path.join(sim_folder, f"{cif_base}_Simulation_profile.png")

    if os.path.exists(sim_png):
        import shutil
        shutil.copy(sim_png, output_path)

    # 收集结果数据
    peaks = []
    for i, mu in enumerate(simulator.mu_list):
        hkl = simulator.HKL_list[i] if i < len(simulator.HKL_list) else []
        mult = simulator.Mult[i] if i < len(simulator.Mult) else 0
        peaks.append({
            "two_theta": round(float(mu), 4),
            "hkl": [int(h) for h in hkl] if hkl else [],
            "mult": int(mult),
        })

    return {
        "n_peaks": len(peaks),
        "peaks": peaks[:50],  # 最多返回 50 个峰
        "n_data_points": len(x_sim) if x_sim is not None else 0,
        "lattice": {
            "a": simulator.LatticCs[0],
            "b": simulator.LatticCs[1],
            "c": simulator.LatticCs[2],
            "alpha": simulator.LatticCs[3],
            "beta": simulator.LatticCs[4],
            "gamma": simulator.LatticCs[5],
        },
        "crystal_system": simulator.crystal_system,
    }


def main():
    parser = argparse.ArgumentParser(description="XRD Simulation")
    parser.add_argument("--cif", required=True, help="CIF 文件路径")
    parser.add_argument("--config", required=True, help="JSON 配置路径")
    parser.add_argument("--output", required=True, help="输出 PNG 路径")
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8-sig") as f:
        config = json.load(f)

    try:
        data = run_simulation(args.cif, config, args.output)

        result = {
            "status": "ok",
            "output": args.output,
            "data": data,
        }
        print(json.dumps(result))

    except Exception as e:
        import traceback
        print(json.dumps({
            "status": "error",
            "message": str(e),
            "traceback": traceback.format_exc(),
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
