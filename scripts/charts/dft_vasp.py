"""
从 VASP DOSCAR / EIGENVAL / PROCAR 生成 DFT 图。
用法:
  python dft_vasp.py --doscar DOSCAR --config cfg.json --output out.png
  python dft_vasp.py --eigenval EIGENVAL [--doscar DOSCAR|--outcar OUTCAR] --config cfg.json --output out.png
  python dft_vasp.py --procar PROCAR [--doscar DOSCAR|--outcar OUTCAR] --config cfg.json --output out.png
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from plot_generic import _dispatch_chart  # noqa: E402
from vasp_io import (  # noqa: E402
    parse_doscar,
    parse_eigenval,
    parse_efermi_from_outcar,
    parse_procar,
)


def _read_text(path: str) -> str:
    with open(path, "rb") as f:
        raw = f.read()
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1", errors="replace")


def _parse_ion_indices(raw) -> list[int] | None:
    if raw in (None, "", []):
        return None
    if isinstance(raw, list):
        out = []
        for x in raw:
            try:
                out.append(int(x))
            except (TypeError, ValueError):
                continue
        return out or None
    text = str(raw).strip()
    if not text:
        return None
    out = []
    for chunk in text.replace("；", ",").replace(" ", ",").split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        try:
            out.append(int(chunk))
        except ValueError:
            continue
    return out or None


def main() -> None:
    parser = argparse.ArgumentParser(description="VASP DOSCAR/EIGENVAL/PROCAR → DFT plot")
    parser.add_argument("--doscar", default="")
    parser.add_argument("--eigenval", default="")
    parser.add_argument("--outcar", default="")
    parser.add_argument("--procar", default="")
    parser.add_argument("--config", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8-sig") as f:
        config = json.load(f)

    kind = str(config.get("kind") or "").lower()
    if not kind:
        if args.procar:
            kind = "procar"
        elif args.eigenval:
            kind = "band"
        else:
            kind = "dos"

    try:
        efermi = None
        if args.doscar:
            dos = parse_doscar(_read_text(args.doscar))
            efermi = dos.get("efermi")
        if args.outcar and efermi is None:
            efermi = parse_efermi_from_outcar(_read_text(args.outcar))
        cfg_fermi = config.get("fermi_energy")
        if cfg_fermi not in (None, ""):
            try:
                efermi = float(cfg_fermi)
            except (TypeError, ValueError):
                pass

        if kind == "dos":
            if not args.doscar:
                raise ValueError("DOS 模式需要 --doscar")
            parsed = parse_doscar(_read_text(args.doscar))
            chart_id = "dft_dos"
            labels = parsed["labels"]
            datasets = parsed["datasets"]
            config.setdefault("orientation", "vertical")
            if efermi is not None:
                config.setdefault("fermi_energy", efermi)
            meta = {
                "efermi": parsed.get("efermi"),
                "nedos": parsed.get("nedos"),
                "n_ions_partial": parsed.get("n_ions_partial"),
            }
        elif kind == "band":
            if not args.eigenval:
                raise ValueError("能带模式需要 --eigenval")
            # 默认相对费米能级
            shift = config.get("shift_to_fermi", True) in (True, "true", "1", 1)
            parsed = parse_eigenval(
                _read_text(args.eigenval),
                efermi=efermi if shift else None,
            )
            chart_id = "dft_band"
            labels = parsed["labels"]
            datasets = parsed["datasets"]
            if shift and efermi is not None:
                config["fermi_energy"] = 0  # 已平移，画 E-Ef=0 参考线
            config.setdefault("symmetry_points", config.get("symmetry_points", ""))
            meta = {
                "efermi": efermi,
                "nkpts": parsed.get("nkpts"),
                "nbands": parsed.get("nbands"),
                "ispin": parsed.get("ispin"),
            }
        elif kind in ("procar", "band_proj", "fatband"):
            if not args.procar:
                raise ValueError("投影能带模式需要 --procar")
            shift = config.get("shift_to_fermi", True) in (True, "true", "1", 1)
            ions = _parse_ion_indices(config.get("ion_indices"))
            parsed = parse_procar(
                _read_text(args.procar),
                efermi=efermi if shift else None,
                ion_indices=ions,
            )
            chart_id = "dft_procar"
            labels = parsed["labels"]
            datasets = parsed["datasets"]
            if shift and efermi is not None:
                config["energies_shifted"] = True
                config["fermi_energy"] = 0
            config.setdefault("symmetry_points", config.get("symmetry_points", ""))
            config.setdefault("project_orbitals", config.get("project_orbitals", "s,p,d"))
            meta = {
                "efermi": efermi,
                "nkpts": parsed.get("nkpts"),
                "nbands": parsed.get("nbands"),
                "nions": parsed.get("nions"),
                "project_orbitals": config.get("project_orbitals"),
            }
        else:
            raise ValueError(f"未知 kind: {kind}")

        config["chart_type"] = chart_id
        config["data"] = {"labels": labels, "datasets": datasets}
        _dispatch_chart(chart_id, labels, datasets, config, args.output)

        print(json.dumps({"status": "ok", "output": args.output, "data": meta}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
