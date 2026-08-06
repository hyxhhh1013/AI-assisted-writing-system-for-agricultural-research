"""
XPS 分析脚本
使用 PyXplore WPEMXPS.XPSEM.XPSsolver 进行 X 射线光电子能谱分解。

用法: python xrd_xps.py --data <csv_path> --config <json_path> --output <png_path>

config JSON:
{
  "title": "XPS Analysis",
  "atom_identifiers": [
    ["Cu2+", "2p3/2", 935.6],
    ["Cu2+", "2p1/2", 938.4],
    ["Cu+", "2p3/2", 933.6]
  ],
  "satellite_peaks": [
    ["Cu2+", "2p3/2", 934.8]
  ],
  "energy_range": [925, 960],
  "bg_params": {
    "LFctg": 0.3,
    "window_length": 15
  },
  "iter_max": 500
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

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from _shared import normalize_label

warnings.filterwarnings("ignore")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plot_utils import load_dataframe
import ase_compat  # noqa: E402, F401


def run_xps_analysis(data_path, config, output_path):
    """运行 XPS 分析"""
    from PyXplore.Background.BacDeduct import TwiceFilter
    from PyXplore.WPEMXPS.XPSEM import XPSsolver

    title = normalize_label(config.get("title", "XPS Analysis"))
    atom_identifiers = config.get("atom_identifiers", [])
    satellite_peaks = config.get("satellite_peaks", [])
    energy_range = config.get("energy_range")
    bg_params = config.get("bg_params", {})
    iter_max = config.get("iter_max", 500)

    be_shift = float(config.get("be_shift", 0) or 0)
    be_cal = config.get("be_calibration")
    if isinstance(be_cal, dict):
        ref_be = be_cal.get("reference_be")
        meas_be = be_cal.get("measured_be")
        if ref_be is not None and meas_be is not None:
            be_shift = float(ref_be) - float(meas_be)

    # PyXplore SLCoupling 按 (元素名, 量子数) 分组做自旋轨道耦合。
    # s 轨道 (1s, 2s, 3s) 的 j 值只有一种 (l+s = 0.5)，无法形成二重态对 →
    # 每个 s 轨道峰给唯一元素名，阻止被分入同一耦合组。
    for i, ident in enumerate(atom_identifiers):
        try:
            orbital_str = str(ident[1])
            # 判断是否 s 轨道：如 "1s1/2", "2s1/2" → 提取 "1s" 或 "2s"
            if orbital_str.startswith(("1s", "2s", "3s", "4s", "5s")):
                ident[0] = f"{ident[0]}_{i}"  # N_0, N_1, ...
        except Exception:
            pass

    # 加载 XPS 数据
    df = load_dataframe(data_path)

    # —— 自动检测数据格式 ——
    # 机器导出格式（如 Avantage/Thermo）：含元数据头 + 多列（BE, Scan A-E, Bkg, Envelope, Residuals）
    # 简单格式：两列 CSV（BE, Intensity）
    is_machine_format = False
    data_start_row = 0

    # 检测是否机器导出格式：搜索 "Binding Energy" 所在行
    for row_idx in range(min(30, len(df))):
        row_vals = [str(v).strip() for v in df.iloc[row_idx].values if pd.notna(v)]
        row_text = " ".join(row_vals)
        if "Binding Energy" in row_text or "binding energy" in row_text.lower():
            is_machine_format = True
            # 数据从标题行的下一行开始（跳过单位行）
            data_start_row = row_idx + 2  # 标题行 + 单位行
            break

    if is_machine_format:
        # 提取标题行确定哪些列有用
        header_row = None
        for r in range(data_start_row - 2, min(data_start_row, len(df))):
            vals = [str(v).strip() for v in df.iloc[r].values]
            if "Binding Energy" in " ".join(vals):
                header_row = vals
                break

        # 取第一列作为 BE（应为 "Binding Energy (E)" 或类似）
        be_col_idx = 0
        # 找第一个 Scan/Intensity 列（跳过单位列、NaN 列）
        int_col_idx = None
        for ci in range(1, len(df.columns)):
            val = str(df.iloc[data_start_row, ci]) if data_start_row < len(df) else ""
            header_val = str(header_row[ci]) if header_row and ci < len(header_row) else ""
            # 跳过全是 NaN 的列
            col_data = df.iloc[data_start_row:, ci]
            if col_data.apply(lambda x: pd.notna(x) and isinstance(x, (int, float))).sum() < 3:
                continue
            int_col_idx = ci
            break

        if int_col_idx is None:
            int_col_idx = 2  # 机器格式通常 col 2 是 Scan A

        # 从数据起始行提取数据
        data_df = df.iloc[data_start_row:].copy()
        be_vals = pd.to_numeric(data_df.iloc[:, be_col_idx], errors="coerce").values
        int_vals = pd.to_numeric(data_df.iloc[:, int_col_idx], errors="coerce").values
        mask = ~(np.isnan(be_vals) | np.isnan(int_vals))
        be = be_vals[mask]
        intensity = int_vals[mask]
        sys.stderr.write(f"[XPS] Machine format detected: BE col={be_col_idx}, Int col={int_col_idx}, data points={len(be)}\n")
    else:
        # 简单格式：前两列
        be_col = df.columns[0]
        int_col = df.columns[1] if len(df.columns) > 1 else df.columns[0]

        be = pd.to_numeric(df[be_col], errors="coerce").values
        intensity = pd.to_numeric(df[int_col], errors="coerce").values

        mask = ~(np.isnan(be) | np.isnan(intensity))
        be, intensity = be[mask], intensity[mask]

    # XPS 数据通常是递减的结合能（高能到低能），需要递增
    if be[0] < be[-1]:
        be = be[::-1]
        intensity = intensity[::-1]

    if abs(be_shift) > 1e-9:
        be = be + be_shift
        sys.stderr.write(f"[XPS] BE calibration shift: {be_shift:+.4f} eV\n")

    xps_df = pd.DataFrame({"BE": be, "Intensity": intensity})

    # 创建临时工作目录
    tmp_work = tempfile.mkdtemp(prefix="xps_")

    # 保存原始数据（无表头供 XPSsolver 读取）
    raw_csv = os.path.join(tmp_work, "raw_intensity.csv")
    np.savetxt(raw_csv, np.column_stack([be, intensity]), delimiter=",", fmt="%.6f")

    # 1. 背景扣除
    with open(os.devnull, "w") as null, redirect_stdout(null), redirect_stderr(null):
        tf = TwiceFilter(Model="XPS", work_dir=tmp_work)
        std_dev = tf.FFTandSGFilter(
            intensity_csv=xps_df,
            LFctg=bg_params.get("LFctg", 0.3),
            bac_split=bg_params.get("bac_split", 5),
            window_length=bg_params.get("window_length", 15),
            polyorder=bg_params.get("polyorder", 3),
            bac_var_type=bg_params.get("bac_var_type", "constant"),
        )

    # 读取背景扣除结果
    conv_dir = os.path.join(tmp_work, "ConvertedDocuments")
    no_bac_csv = os.path.join(conv_dir, "no_bac_intensity.csv")
    bac_csv = os.path.join(conv_dir, "bac.csv")

    if not os.path.exists(no_bac_csv) or not os.path.exists(bac_csv):
        raise ValueError("背景扣除失败，请检查数据")

    # 2. 运行 XPS 求解器
    # PyXplore SLCoupling 完全不能处理 s 轨道单峰（无自旋分裂）。
    # line 827 的 `OriPeaks[k]==1` 永远走不到，line 829 list.append 语法错误。
    # 完整重写 SLCoupling：单峰组跳过 calib_energy_fun 直接传递。
    import PyXplore.WPEMXPS.XPSEM as _xpsem
    from PyXplore.WPEMXPS.XPSEM import calib_energy_fun, cal_SatPeaks

    def _fixed_SLCoupling(_mu_list, _ori_mu_list, _w_list, OriPeaks, SatPeaks,
                          tao, ratio, p2_list):
        import copy
        new_mu_list = copy.deepcopy(_mu_list)
        new_w_list = copy.deepcopy(_w_list)
        ori_mu_list = copy.deepcopy(_ori_mu_list)
        # fine-tuning (原 line 815-820)
        for peak in range(len(new_mu_list)):
            if abs(new_mu_list[peak] - ori_mu_list[peak]) >= tao:
                new_mu_list[peak] = ratio * ori_mu_list[peak] + (1 - ratio) * _mu_list[peak]

        total_index = 0
        orbit_names = []
        for k in range(len(OriPeaks)):
            group = OriPeaks[k]
            # 单峰或标记为1 → 不耦合
            if not isinstance(group, list) or len(group) <= 1:
                if isinstance(group, list) and len(group) == 1:
                    orbit_names.append([group[0][0], group[0][1]])
                total_index += 1
            else:
                related_peaks, quantum_num = [], []
                for v in range(len(group)):
                    orbit_names.append([group[v][0], group[v][1]])
                    related_peaks.append(total_index)
                    quantum_num.append(group[v][3])
                    total_index += 1
                    atom_name = group[v][0]
                if len(quantum_num) >= 2:
                    new_mu_list, new_w_list = calib_energy_fun(
                        new_mu_list, new_w_list, related_peaks, quantum_num, atom_name)

        for k in range(len(SatPeaks)):
            group = SatPeaks[k]
            if not isinstance(group, list) or len(group) <= 1:
                if isinstance(group, list) and len(group) == 1:
                    orbit_names.append([group[0][0], group[0][1]])
                total_index += 1
            else:
                _orbit_name_list, SatPeaks_loc = [], []
                for v in range(len(group)):
                    _orbit_name_list.append([group[v][0], group[v][1]])
                    SatPeaks_loc.append(total_index)
                    total_index += 1
                new_w_list, _child_peaks = cal_SatPeaks(
                    new_mu_list, new_w_list, orbit_names, _orbit_name_list,
                    SatPeaks_loc, p2_list)

        return new_mu_list, new_w_list, []

    _xpsem.SLCoupling = _fixed_SLCoupling

    with open(os.devnull, "w") as null, redirect_stdout(null), redirect_stderr(null):
        # s_energy 应设为能量区间而非单个浮点数（PyXplore 类型要求）
        s_energy_val = energy_range if energy_range else [float(be.min()), float(be.max())]
        solver = XPSsolver(
            Var=1.0, asy_C=0.1, s_energy=s_energy_val,
            atomIdentifier=atom_identifiers,
            SatellitePeaks=satellite_peaks,
            no_bac_df=no_bac_csv,
            original_df=raw_csv,
            bacground_df=bac_csv,
            energy_range=tuple(energy_range) if energy_range else None,
            bta=0.5, bta_threshold=0.3, limit=0.1, iter_limit=5,
            w_limit=0.001, iter_max=iter_max, lock_num=20,
            InitializationEpoch=20, loadParams=False, tao=0.05, ratio=0.1,
            work_dir=tmp_work,
        )
        Rp, Rwp, i_ter, flag = solver.cal_output_result()

    # 3. 读取拟合结果
    components = []
    fr_folder = os.path.join(tmp_work, "XPSFittingProfile")
    com_folder = os.path.join(tmp_work, "XPScomponents")

    # 读取峰参数
    rp_val = None
    rwp_val = None
    rsq_val = None
    params_csv = os.path.join(com_folder, "QuantumState.csv")
    if os.path.exists(params_csv):
        with open(params_csv, "r") as f:
            lines = f.readlines()
        header = lines[0] if lines else ""
        if "Rp:" in header:
            rp_val = float(header.split("Rp:")[1].split(",")[0].strip())
        if "Rwp:" in header:
            rwp_val = float(header.split("Rwp:")[1].split(",")[0].strip())
        if "Rsquare:" in header:
            rsq_val = float(header.split("Rsquare:")[1].strip())

        for line in lines[1:]:
            parts = line.strip().split(",")
            if len(parts) >= 6:
                components.append({
                    "weight": float(parts[0]),
                    "asymmetry": float(parts[1]),
                    "mu": float(parts[2]),
                    "gamma": float(parts[3]),
                    "sigma2": float(parts[4]),
                    "fwhm": float(parts[5]),
                })

    # 读取拟合曲线
    fit_csv = os.path.join(com_folder, "FittingProfile.csv")
    fit_be, fit_int = None, None
    if os.path.exists(fit_csv):
        fit_df = pd.read_csv(fit_csv, header=None, names=["be", "intensity"])
        fit_be = fit_df["be"].values
        fit_int = fit_df["intensity"].values

    # 4. 生成出版级 XPS 图
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5),
                                    gridspec_kw={"width_ratios": [2, 1]})

    # 左图：XPS 拟合结果
    ax1.plot(be, intensity, "-k", linewidth=1.0, label="Experimental", alpha=0.8)
    if fit_be is not None and fit_int is not None:
        ax1.plot(fit_be, fit_int, "-", color="#E74C3C", linewidth=1.5,
                 label="WPEM-XPS fit")
        ax1.fill_between(fit_be, fit_int, fit_int.min(), alpha=0.1, color="#E74C3C")

    # 各组分
    comp_colors = ["#2980B9", "#27AE60", "#F39C12", "#8E44AD", "#1ABC9C"]
    for i, comp in enumerate(components[:10]):
        c = comp_colors[i % len(comp_colors)]
        ax1.axvline(x=comp["mu"], color=c, linestyle="--", linewidth=0.8, alpha=0.6)
        ax1.text(comp["mu"], ax1.get_ylim()[1] * 0.9, f"{comp['mu']:.1f}",
                 fontsize=6, rotation=90, color=c, ha="right", alpha=0.8)

    ax1.set_xlabel("Binding Energy (eV)", fontsize=12)
    ax1.set_ylabel("Intensity (a.u.)", fontsize=12)
    ax1.set_title(title, fontsize=14, fontweight="bold")
    ax1.legend(fontsize=9)
    ax1.grid(True, alpha=0.15)
    ax1.invert_xaxis()  # XPS 结合能从高到低

    # 右图：R 因子和组分表
    ax2.axis("off")
    info_lines = [
        f"Iterations: {i_ter}",
        f"Rp: {rp_val:.2f}%" if rp_val else "",
        f"Rwp: {rwp_val:.2f}%" if rwp_val else "",
        f"Rsquare: {rsq_val:.4f}" if rsq_val else "",
        "",
        "Detected Peaks:",
    ]
    for i, comp in enumerate(components):
        info_lines.append(
            f"  #{i + 1}: {comp['mu']:.2f} eV  "
            f"FWHM={comp['fwhm']:.3f}  "
            f"W={comp['weight']:.1f}"
        )

    ax2.text(0.05, 0.95, "\n".join(info_lines),
             transform=ax2.transAxes, fontsize=9, fontfamily="monospace",
             verticalalignment="top", horizontalalignment="left")

    plt.tight_layout()
    fig.savefig(output_path, dpi=200, bbox_inches="tight")
    plt.close(fig)

    # 清理临时目录
    shutil.rmtree(tmp_work, ignore_errors=True)

    return {
        "n_components": len(components),
        "components": components,
        "rp": rp_val,
        "rwp": rwp_val,
        "rsquare": rsq_val,
        "iterations": i_ter,
        "exit_flag": flag,
        "be_shift": be_shift if abs(be_shift) > 1e-9 else None,
    }


def main():
    parser = argparse.ArgumentParser(description="XPS Analysis")
    parser.add_argument("--data", required=True, help="XPS 数据文件路径 (CSV)")
    parser.add_argument("--config", required=True, help="JSON 配置路径")
    parser.add_argument("--output", required=True, help="输出 PNG 路径")
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8-sig") as f:
        config = json.load(f)

    try:
        data = run_xps_analysis(args.data, config, args.output)
        result = {"status": "ok", "output": args.output, "data": data}
        print(json.dumps(result))
    except Exception as e:
        import traceback
        print(json.dumps({"status": "error", "message": str(e),
                          "traceback": traceback.format_exc()}))
        sys.exit(1)


if __name__ == "__main__":
    main()
