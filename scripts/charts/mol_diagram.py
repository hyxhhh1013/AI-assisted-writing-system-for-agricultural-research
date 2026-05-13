"""
分子结构图生成脚本
使用 RDKit 从 SMILES 渲染分子结构图和反应式。

用法:
  python mol_diagram.py --config <json_path> --output <png_path>

config JSON:
  {"type": "mol", "config": {"smiles": "CC(=O)O", "label": "乙酸", "size": 300}}
  或
  {"type": "reaction", "config": {
    "title": "酯化反应",
    "reactants": [{"smiles": "CC(=O)O", "label": "乙酸"}, {"smiles": "CCO", "label": "乙醇"}],
    "products": [{"smiles": "CC(=O)OCC", "label": "乙酸乙酯"}],
    "conditions": "H₂SO₄, △"
  }}
"""
import argparse
import json
import os
import sys
import warnings

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

from _shared import normalize_label

warnings.filterwarnings("ignore")

from rdkit import Chem
from rdkit.Chem import Draw, Descriptors, AllChem
from rdkit.Chem.Draw import rdMolDraw2D


def smiles_to_mol(smiles: str):
    """将 SMILES 转为 RDKit Mol 对象"""
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"无效的 SMILES: {smiles}")
    AllChem.Compute2DCoords(mol)
    return mol


def draw_molecule(smiles: str, label: str = "", size: int = 300):
    """绘制单个分子结构图"""
    mol = smiles_to_mol(smiles)
    img = Draw.MolToImage(mol, size=(size, size), kekulize=True)
    return img


def draw_reaction(config: dict):
    """绘制反应式：反应物 → 产物"""
    title = normalize_label(config.get("title", ""))
    conditions = normalize_label(config.get("conditions", ""))
    reactants_cfg = config.get("reactants", [])
    products_cfg = config.get("products", [])

    all_configs = reactants_cfg + products_cfg
    n_total = len(all_configs)
    if n_total == 0:
        raise ValueError("至少需要一个分子")

    mols = []
    labels = []
    infos: list[dict] = []
    for item in all_configs:
        mol = smiles_to_mol(item["smiles"])
        mols.append(mol)
        labels.append(item.get("label", ""))
        infos.append({
            "formula": _calc_formula(mol),
            "molWeight": round(Descriptors.MolWt(mol), 3),
            "nAtoms": mol.GetNumAtoms(),
            "nBonds": mol.GetNumBonds(),
            "logP": round(Descriptors.MolLogP(mol), 3),
        })

    # 两行或一行排列：反应物 | 箭头 + 条件 | 产物
    n_reactants = len(reactants_cfg)
    fig, axes = plt.subplots(1, n_total + 1, figsize=(3 * (n_total + 1), 3),
                             gridspec_kw={"width_ratios": [2] * n_total + [1]})

    if n_total == 1:
        axes = [axes]

    # 绘制分子
    for i, mol in enumerate(mols):
        try:
            drawer = rdMolDraw2D.MolDraw2DCairo(300, 300)
            opts = drawer.drawOptions()
            opts.clearBackground = False
            drawer.DrawMolecule(mol)
            drawer.FinishDrawing()
            import io
            from PIL import Image
            buf = io.BytesIO(drawer.GetDrawingText())
            img = Image.open(buf)
            axes[i].imshow(img)
        except Exception:
            img = Draw.MolToImage(mol, size=(300, 300))
            axes[i].imshow(img)

        axes[i].axis("off")
        if labels[i]:
            axes[i].set_title(labels[i], fontsize=10, pad=4)

    # 箭头列
    ax_arrow = axes[-1]
    ax_arrow.axis("off")
    ax_arrow.set_xlim(0, 1)
    ax_arrow.set_ylim(0, 1)
    ax_arrow.annotate("", xy=(0.8, 0.5), xytext=(0.2, 0.5),
                      arrowprops=dict(arrowstyle="->", lw=2.5, color="#2C3E50"))
    if conditions:
        ax_arrow.text(0.5, 0.65, conditions, ha="center", va="bottom",
                      fontsize=9, fontstyle="italic", color="#555")
    ax_arrow.text(0.5, 0.3, "→", ha="center", va="top", fontsize=16, color="#2C3E50")

    if title:
        fig.suptitle(title, fontsize=14, fontweight="bold", y=1.02)

    plt.tight_layout()
    return fig, infos


def _calc_formula(mol) -> str:
    """计算分子式"""
    from collections import Counter
    formula = Counter()
    for atom in mol.GetAtoms():
        formula[atom.GetSymbol()] += 1
    return "".join(f"{elem}{count if count > 1 else ''}" for elem, count in sorted(formula.items()))


def main():
    parser = argparse.ArgumentParser(description="Molecular Diagram")
    parser.add_argument("--config", required=True, help="JSON 配置路径")
    parser.add_argument("--output", required=True, help="输出 PNG 路径")
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8-sig") as f:
        cfg = json.load(f)

    try:
        req_type = cfg.get("type", "mol")
        req_config = cfg.get("config", {})

        if req_type == "reaction":
            fig, mol_infos = draw_reaction(req_config)
            fig.savefig(args.output, dpi=200, bbox_inches="tight")
            plt.close(fig)
            result = {
                "status": "ok",
                "output": args.output,
                "data": {"mols": mol_infos},
            }
        else:
            smiles = req_config.get("smiles", "")
            label = req_config.get("label", "")
            size = req_config.get("size", 300)
            mol = smiles_to_mol(smiles)
            img = draw_molecule(smiles, label, size)
            img.save(args.output)
            mol_info = {
                "formula": _calc_formula(mol),
                "molWeight": round(Descriptors.MolWt(mol), 3),
                "nAtoms": mol.GetNumAtoms(),
                "nBonds": mol.GetNumBonds(),
                "logP": round(Descriptors.MolLogP(mol), 3),
            }
            result = {
                "status": "ok",
                "output": args.output,
                "data": {"mols": [mol_info]},
            }

        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
