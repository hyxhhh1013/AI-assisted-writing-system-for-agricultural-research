"""
晶胞可视化脚本
使用 PyXplore Plot.UnitCell 绘制 3D 晶胞结构。
支持 CIF 文件解析和手动参数输入。

用法: python xrd_unitcell.py --cif <cif_path> --output <png_path>
  或: python xrd_unitcell.py --params <json> --atoms <json> --output <png_path>
"""
import argparse
import json
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ase_compat  # noqa: E402, F401
from _shared import normalize_label

plt.rcParams["font.sans-serif"] = ["SimHei", "Microsoft YaHei", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False


def parse_cif(cif_path):
    """从 CIF 文件提取晶格参数和原子坐标"""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from PyXplore.Extinction.XRDpre import read_cif

    latt, spaceG, sites, symbol, symmetric_operation = read_cif(cif_path)
    # sites[0] = space_group_code, sites[1:] = [element, x, y, z]
    atom_coords = sites[1:] if sites and len(sites) > 1 else []
    return latt, atom_coords, spaceG, symbol


def generate_unitcell_plot(lattice_param, atom_coordinates, output_path,
                           elevation=30, azimuth=60, title=None):
    """生成晶胞 3D 可视化图"""
    a, b, c = lattice_param[0], lattice_param[1], lattice_param[2]
    alpha, beta, gamma = lattice_param[3], lattice_param[4], lattice_param[5]

    from PyXplore.XRDSimulation.DiffractionGrometry.atom import atomics

    # 晶胞顶点
    vertices = np.array([[0, 0, 0], [a, 0, 0], [a, b, 0], [0, b, 0],
                         [0, 0, c], [a, 0, c], [a, b, c], [0, b, c]])

    # 旋转矩阵
    alpha_r = np.radians(alpha)
    beta_r = np.radians(beta)
    gamma_r = np.radians(gamma)
    rotation_matrix = np.array([
        [np.cos(alpha_r) * np.cos(beta_r),
         -np.sin(alpha_r),
         np.cos(alpha_r) * np.sin(beta_r)],
        [np.sin(alpha_r) * np.cos(beta_r) * np.sin(gamma_r) + np.cos(alpha_r) * np.sin(gamma_r),
         np.cos(alpha_r) * np.cos(gamma_r),
         -np.sin(alpha_r) * np.sin(beta_r) * np.sin(gamma_r) + np.cos(alpha_r) * np.cos(beta_r) * np.cos(gamma_r)],
        [-np.cos(alpha_r) * np.cos(beta_r) * np.cos(gamma_r) + np.sin(alpha_r) * np.sin(gamma_r),
         np.cos(alpha_r) * np.sin(gamma_r),
         np.sin(alpha_r) * np.cos(beta_r) * np.cos(gamma_r) + np.cos(alpha_r) * np.sin(beta_r) * np.sin(gamma_r)],
    ])
    tv = np.zeros(3)
    transformed = (rotation_matrix @ (vertices.T - tv[:, np.newaxis])).T

    fig = plt.figure(figsize=(8, 8))
    ax = fig.add_subplot(111, projection="3d")

    # 绘制晶胞边框
    colors_face = ["#4A90D9", "#4A90D9", "#E57373", "#E57373", "#81C784", "#81C784"]
    cube_faces = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4],
                  [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    for i, face in enumerate(cube_faces):
        poly = Poly3DCollection([transformed[face]], linewidths=1.5,
                                 edgecolor="black", alpha=0.08)
        poly.set_facecolor(colors_face[i])
        poly.set_alpha(0.06)
        ax.add_collection3d(poly)

    # 绘制原子
    color_map = ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF",
                 "#00FFFF", "#800000", "#008000", "#000080", "#808000",
                 "#800080", "#008080", "#FFA500", "#FFC0CB", "#FFD700",
                 "#008B8B", "#00FF7F", "#7B68EE", "#FF4500", "#FF1493"]

    atom_list = []
    for atom in atom_coordinates:
        ion = str(atom[0])
        x, y, z = float(atom[1]), float(atom[2]), float(atom[3])

        # 获取原子信息
        try:
            dict_atom = atomics()
            _ = dict_atom[ion]
        except (KeyError, TypeError):
            # 提取纯元素名（去除数字/电荷）
            import re
            ion = re.sub(r'[^A-Za-z]+', "", ion)
            try:
                dict_atom = atomics()
                _ = dict_atom[ion]
            except (KeyError, TypeError):
                ion = ion[0] if ion else "H"

        if ion not in atom_list:
            atom_list.append(ion)

        try:
            size = dict_atom[ion]["0"] * 8
        except (KeyError, TypeError):
            size = 30

        idx = atom_list.index(ion) % len(color_map)
        point = np.array([x * a, y * b, z * c])
        tp = (rotation_matrix @ (point - tv)).T
        ax.scatter(tp[0], tp[1], tp[2], c=color_map[idx],
                   s=size, marker="o", edgecolor="black",
                   linewidths=0.5, alpha=0.9, zorder=5)

    # 图例
    for i, elem in enumerate(atom_list):
        idx = i % len(color_map)
        ax.scatter([], [], c=color_map[idx], s=60, label=elem,
                   marker="o", edgecolor="black", linewidths=0.5)

    ax.view_init(elev=elevation, azim=azimuth)
    ax.set_xticks([])
    ax.set_yticks([])
    ax.set_zticks([])
    ax.set_xlabel("X", labelpad=-20)
    ax.set_ylabel("Y", labelpad=-20)
    ax.set_zlabel("Z", labelpad=-20)
    ax.xaxis.line.set_color((1, 1, 1, 0))
    ax.yaxis.line.set_color((1, 1, 1, 0))
    ax.zaxis.line.set_color((1, 1, 1, 0))
    ax.xaxis.set_pane_color((1, 1, 1, 0))
    ax.yaxis.set_pane_color((1, 1, 1, 0))
    ax.zaxis.set_pane_color((1, 1, 1, 0))
    ax.grid(False)
    ax.legend(fontsize=10, loc="upper right")

    if title:
        ax.set_title(title, fontsize=14, fontweight="bold", pad=20)

    plt.tight_layout()
    fig.savefig(output_path, dpi=200, bbox_inches="tight")
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description="Unit Cell Visualization")
    parser.add_argument("--cif", help="CIF 文件路径")
    parser.add_argument("--params", help="晶格参数 JSON: [a,b,c,alpha,beta,gamma]")
    parser.add_argument("--atoms", help="原子坐标 JSON: [[elem,x,y,z],...]")
    parser.add_argument("--config", help="配置 JSON 路径（可选）")
    parser.add_argument("--output", required=True, help="输出 PNG 路径")
    parser.add_argument("--title", help="图表标题")
    args = parser.parse_args()

    title = args.title or "Unit Cell"
    elevation = 30
    azimuth = 60

    # 如果有 config 文件，读取额外配置
    extra_config = {}
    if args.config:
        with open(args.config, "r", encoding="utf-8") as f:
            extra_config = json.load(f)
        title = extra_config.get("title", title)
        elevation = extra_config.get("elevation", elevation)
        azimuth = extra_config.get("azimuth", azimuth)

    lattice_param = None
    atom_coordinates = []
    space_group = ""
    crystal_symbol = ""

    try:
        if args.cif:
            lattice_param, atom_coords, space_group, crystal_symbol = parse_cif(args.cif)
            atom_coordinates = atom_coords
            if not title or title == "Unit Cell":
                title = f"Unit Cell — {crystal_symbol or 'Unknown'}"
        elif args.params and args.atoms:
            lattice_param = json.loads(args.params)
            atom_coordinates = json.loads(args.atoms)
        else:
            print(json.dumps({"status": "error",
                              "message": "请提供 --cif 或 --params + --atoms"}))
            sys.exit(1)

        if not lattice_param or len(lattice_param) < 6:
            print(json.dumps({"status": "error",
                              "message": "无效的晶格参数"}))
            sys.exit(1)

        generate_unitcell_plot(lattice_param, atom_coordinates,
                                output_path=args.output,
                                elevation=elevation, azimuth=azimuth,
                                title=title)

        result = {
            "status": "ok",
            "output": args.output,
            "data": {
                "lattice": {
                    "a": lattice_param[0], "b": lattice_param[1],
                    "c": lattice_param[2], "alpha": lattice_param[3],
                    "beta": lattice_param[4], "gamma": lattice_param[5],
                },
                "n_atoms": len(atom_coordinates),
                "space_group": space_group or "",
                "crystal_symbol": crystal_symbol or "",
            },
        }
        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
