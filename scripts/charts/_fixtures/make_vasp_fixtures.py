"""生成最小 DOSCAR / EIGENVAL / PROCAR 样例供冒烟测试。"""
from __future__ import annotations

import os

HERE = os.path.dirname(os.path.abspath(__file__))


def write_doscar(path: str, nedos: int = 21, efermi: float = 0.5) -> None:
    lines = [
        "   2   2   1   1",
        "  0.1234567E+02  0.1234567E+02  0.1234567E+02  0.1234567E+02",
        "  1.000000000000000E-004",
        "  CAR ",
        " unknown system",
        f"  5.0  -5.0  {nedos}  {efermi}  1.00000000",
    ]
    for i in range(nedos):
        e = -5.0 + i * (10.0 / (nedos - 1))
        dos = max(0.0, 1.5 - abs(e - efermi) * 0.3)
        intd = i * 0.1
        lines.append(f"  {e:16.8E}  {dos:16.8E}  {intd:16.8E}")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def write_eigenval(path: str, nk: int = 5, nb: int = 4) -> None:
    lines = [
        "  unknown",
        "   1",
        "  0.0",
        "  CAR",
        " unknown system",
        f"   {nk}    {nb}     1",
        "",
    ]
    for ik in range(nk):
        kx = ik / max(nk - 1, 1)
        lines.append(f"  {kx:.6f}  0.000000  0.000000  0.100000")
        for ib in range(1, nb + 1):
            e = -2.0 + ib * 0.8 + kx * 0.3
            lines.append(f"    {ib}  {e:.6f}  1.000000")
        lines.append("")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def write_procar(path: str, nk: int = 5, nb: int = 4, nions: int = 2) -> None:
    """最小 lm-decomposed PROCAR（无自旋）。"""
    lines = [
        "PROCAR lm decomposed",
        f"# of k-points:    {nk}         # of bands:    {nb}         # of ions:    {nions}",
        "",
    ]
    for ik in range(1, nk + 1):
        kx = (ik - 1) / max(nk - 1, 1)
        lines.append(
            f" k-point    {ik} :    {kx:.8f} 0.00000000 0.00000000     weight = {1.0 / nk:.8f}"
        )
        lines.append("")
        for ib in range(1, nb + 1):
            energy = -2.0 + ib * 0.8 + kx * 0.3
            lines.append(f"band   {ib} # energy   {energy:.8f} # occ.  1.00000000")
            lines.append("")
            lines.append(
                "ion      s     py     pz     px    dxy    dyz    dz2    dxz    dx2    tot"
            )
            tot_s = tot_p = tot_d = tot_all = 0.0
            for ion in range(1, nions + 1):
                s = 0.20 * (1.0 / ib) / nions
                pvals = [0.05 / nions, 0.04 / nions, 0.03 / nions]
                dvals = [0.02 * ib / nions] * 5
                row_tot = s + sum(pvals) + sum(dvals)
                tot_s += s
                tot_p += sum(pvals)
                tot_d += sum(dvals)
                tot_all += row_tot
                lines.append(
                    f"  {ion}  {s:8.5f}  {pvals[0]:8.5f}  {pvals[1]:8.5f}  {pvals[2]:8.5f}  "
                    f"{dvals[0]:8.5f}  {dvals[1]:8.5f}  {dvals[2]:8.5f}  {dvals[3]:8.5f}  "
                    f"{dvals[4]:8.5f}  {row_tot:8.5f}"
                )
            lines.append(
                f"tot  {tot_s:8.5f}  {tot_p / 3:8.5f}  {tot_p / 3:8.5f}  {tot_p / 3:8.5f}  "
                f"{tot_d / 5:8.5f}  {tot_d / 5:8.5f}  {tot_d / 5:8.5f}  {tot_d / 5:8.5f}  "
                f"{tot_d / 5:8.5f}  {tot_all:8.5f}"
            )
            lines.append("")
        lines.append("")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def write_xy(path: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        f.write("# Jade export\n")
        f.write("10.0  100\n20.0  400\n30.0  150\n40.0  80\n")


if __name__ == "__main__":
    write_doscar(os.path.join(HERE, "DOSCAR"))
    write_eigenval(os.path.join(HERE, "EIGENVAL"))
    write_procar(os.path.join(HERE, "PROCAR"))
    write_xy(os.path.join(HERE, "sample.xy"))
    print("fixtures written to", HERE)
