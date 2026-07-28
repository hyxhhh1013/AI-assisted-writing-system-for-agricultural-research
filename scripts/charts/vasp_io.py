"""
VASP 文本输出解析（DOSCAR / EIGENVAL）。

DOSCAR → energy + total DOS（可选 spin up/down）
EIGENVAL → k-path 距离 + 各 band 能量（可减 E-fermi；费米能级可从 DOSCAR/OUTCAR 传入）
"""
from __future__ import annotations

import math
import re
from typing import Any


def _floats(line: str) -> list[float]:
    return [float(x) for x in line.split()]


def parse_doscar(text: str) -> dict[str, Any]:
    # 保留空行位置：标准 DOSCAR 前 5 行头 + 第 6 行能量范围
    raw_lines = text.splitlines()
    if len(raw_lines) < 7:
        raise ValueError("DOSCAR 过短，无法解析")

    # 第 6 行（index 5）：Emax Emin NEDOS Efermi ...
    header_line = raw_lines[5].strip()
    hdr = _floats(header_line)
    if len(hdr) < 4:
        raise ValueError(f"DOSCAR 能量头行无法解析: {header_line!r}")
    nedos = int(hdr[2])
    efermi = float(hdr[3])

    start = 6
    end = start + nedos
    if len(raw_lines) < end:
        raise ValueError(f"DOSCAR 数据行不足：期望 {nedos}，实际 {len(raw_lines) - start}")

    energy: list[float] = []
    dos_cols: list[list[float]] = []
    colnames: list[str] = []

    first = _floats(raw_lines[start])
    if len(first) < 2:
        raise ValueError("DOSCAR 数据列不足")
    # energy, dos[, dos_down], intdos[, ...]
    n_fields = len(first)
    if n_fields >= 5:
        # spin polarized: E dos_up dos_down int_up int_down
        colnames = ["Total_up", "Total_down"]
    else:
        colnames = ["Total"]

    for name in colnames:
        dos_cols.append([])

    for i in range(start, end):
        vals = _floats(raw_lines[i])
        if len(vals) < 2:
            continue
        energy.append(vals[0])
        if colnames == ["Total_up", "Total_down"]:
            dos_cols[0].append(vals[1])
            dos_cols[1].append(vals[2] if len(vals) > 2 else 0.0)
        else:
            dos_cols[0].append(vals[1])

    # 可选：离子投影块 — 取各离子 s/p/d 粗加总（若列数够）
    # 跳过总 DOS 后，每个离子一块：一行头 + NEDOS 行
    cursor = end
    partial: dict[str, list[float]] = {"s": [], "p": [], "d": []}
    ion_blocks = 0
    while cursor + 1 + nedos <= len(raw_lines) and ion_blocks < 64:
        # 头行通常含能量范围再次出现
        try:
            block_hdr = _floats(raw_lines[cursor].strip())
        except ValueError:
            break
        if len(block_hdr) < 3:
            break
        # 下一行起 NEDOS
        block_start = cursor + 1
        block_end = block_start + nedos
        if block_end > len(raw_lines):
            break
        sample = _floats(raw_lines[block_start])
        # 投影 DOS 常见：E s p_y p_z p_x d... 或 spin 翻倍
        if len(sample) < 3:
            break
        if not partial["s"]:
            partial["s"] = [0.0] * nedos
            partial["p"] = [0.0] * nedos
            partial["d"] = [0.0] * nedos
        for bi, li in enumerate(range(block_start, block_end)):
            vals = _floats(raw_lines[li])
            if len(vals) < 2:
                continue
            # vals[0]=E；其后为轨道
            orbs = vals[1:]
            s = orbs[0] if len(orbs) > 0 else 0.0
            p = sum(orbs[1:4]) if len(orbs) >= 4 else (orbs[1] if len(orbs) > 1 else 0.0)
            d = sum(orbs[4:9]) if len(orbs) >= 9 else sum(orbs[4:]) if len(orbs) > 4 else 0.0
            partial["s"][bi] += s
            partial["p"][bi] += p
            partial["d"][bi] += d
        ion_blocks += 1
        cursor = block_end

    datasets = [{"label": colnames[i], "data": dos_cols[i]} for i in range(len(colnames))]
    if ion_blocks > 0:
        for key in ("s", "p", "d"):
            if any(abs(v) > 1e-12 for v in partial[key]):
                datasets.append({"label": key, "data": partial[key]})

    return {
        "kind": "dos",
        "efermi": efermi,
        "nedos": nedos,
        "n_ions_partial": ion_blocks,
        "labels": [str(e) for e in energy],
        "energy": energy,
        "datasets": datasets,
    }


def parse_eigenval(text: str, efermi: float | None = None) -> dict[str, Any]:
    lines = [ln.strip() for ln in text.splitlines()]
    # 找到 "nkpts nbands ispin" 行：三个整数
    meta_idx = None
    nkpts = nbands = ispin = 0
    for i, ln in enumerate(lines):
        parts = ln.split()
        if len(parts) == 3 and all(re.fullmatch(r"-?\d+", p) for p in parts):
            a, b, c = int(parts[0]), int(parts[1]), int(parts[2])
            if a > 0 and b > 0 and c in (1, 2):
                nkpts, nbands, ispin = a, b, c
                meta_idx = i
                break
    if meta_idx is None:
        raise ValueError("无法在 EIGENVAL 中定位 nkpts/nbands/ispin")

    # 从 meta 下一空行后开始读 k 点
    idx = meta_idx + 1
    kpoints: list[tuple[float, float, float]] = []
    bands: list[list[float]] = [[] for _ in range(nbands * ispin)]

    for _kp in range(nkpts):
        # 跳过空行
        while idx < len(lines) and lines[idx] == "":
            idx += 1
        if idx >= len(lines):
            raise ValueError("EIGENVAL k 点数据不完整")
        kvals = _floats(lines[idx])
        if len(kvals) < 3:
            raise ValueError(f"无效 k 点行: {lines[idx]!r}")
        kpoints.append((kvals[0], kvals[1], kvals[2]))
        idx += 1
        for ib in range(nbands):
            while idx < len(lines) and lines[idx] == "":
                idx += 1
            if idx >= len(lines):
                raise ValueError("EIGENVAL 能带行不完整")
            vals = _floats(lines[idx])
            idx += 1
            # band_index energy [energy_down] [occ...]
            if ispin == 2 and len(vals) >= 3:
                bands[ib].append(vals[1])
                bands[ib + nbands].append(vals[2])
            elif len(vals) >= 2:
                bands[ib].append(vals[1])
            else:
                raise ValueError(f"无效能带行: {vals}")

    # k 路径累积距离
    dists = [0.0]
    for i in range(1, len(kpoints)):
        dx = kpoints[i][0] - kpoints[i - 1][0]
        dy = kpoints[i][1] - kpoints[i - 1][1]
        dz = kpoints[i][2] - kpoints[i - 1][2]
        dists.append(dists[-1] + math.sqrt(dx * dx + dy * dy + dz * dz))

    # 归一化到 [0,1] 便于标高对称点
    total = dists[-1] if dists[-1] > 0 else 1.0
    dists_n = [d / total for d in dists]

    datasets = []
    for i, series in enumerate(bands):
        if len(series) != len(dists_n):
            continue
        data = series
        if efermi is not None:
            data = [e - efermi for e in series]
        label = f"band{i + 1}" if ispin == 1 else (
            f"band{i + 1}_up" if i < nbands else f"band{i - nbands + 1}_down"
        )
        datasets.append({"label": label, "data": data})

    return {
        "kind": "band",
        "nkpts": nkpts,
        "nbands": nbands,
        "ispin": ispin,
        "efermi": efermi,
        "labels": [f"{d:.6f}" for d in dists_n],
        "k_distance": dists_n,
        "datasets": datasets,
    }


def parse_efermi_from_outcar(text: str) -> float | None:
    # 取最后一次 E-fermi
    matches = re.findall(r"E-fermi\s*:\s*([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)", text)
    if not matches:
        return None
    return float(matches[-1])


_PROCAR_HEADER_RE = re.compile(
    r"#\s*of\s*k-points\s*:\s*(\d+).*?#\s*of\s*bands\s*:\s*(\d+).*?#\s*of\s*ions\s*:\s*(\d+)",
    re.IGNORECASE | re.DOTALL,
)
_KPOINT_RE = re.compile(
    r"k-point\s+(\d+)\s*:\s*([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)"
    r"\s+([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)"
    r"\s+([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)",
    re.IGNORECASE,
)
_BAND_RE = re.compile(
    r"band\s+(\d+)\s*#\s*energy\s+([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)",
    re.IGNORECASE,
)


def _classify_orb_columns(header_tokens: list[str]) -> dict[str, list[int]]:
    """将 PROCAR 表头列映射到 s / p / d / tot 索引（不含 ion 列）。"""
    cols = [t.lower() for t in header_tokens]
    # 去掉 leading 'ion'
    if cols and cols[0] == "ion":
        cols = cols[1:]
    mapping: dict[str, list[int]] = {"s": [], "p": [], "d": [], "tot": []}
    for i, name in enumerate(cols):
        if name in ("tot", "total"):
            mapping["tot"].append(i)
        elif name == "s" or name.startswith("s_"):
            mapping["s"].append(i)
        elif name == "p" or name.startswith("p"):
            mapping["p"].append(i)
        elif name == "d" or name.startswith("d"):
            mapping["d"].append(i)
        elif name == "f" or name.startswith("f"):
            # f 轨道并入 d 粗投影，避免丢列
            mapping["d"].append(i)
    return mapping


def _sum_orb(vals: list[float], idxs: list[int]) -> float:
    return float(sum(vals[i] for i in idxs if 0 <= i < len(vals)))


def parse_procar(
    text: str,
    *,
    efermi: float | None = None,
    ion_indices: list[int] | None = None,
) -> dict[str, Any]:
    """
    解析 VASP PROCAR（lm decomposed / 简并 s-p-d）。

    返回 k 路径归一化距离、各 band 能量，以及按离子加总的 s/p/d/tot 权重。
    ion_indices: 1-based 离子序号列表；None 表示全部离子。
    """
    lines = text.splitlines()
    if len(lines) < 5:
        raise ValueError("PROCAR 过短，无法解析")

    header_blob = "\n".join(lines[:40])
    m = _PROCAR_HEADER_RE.search(header_blob)
    if not m:
        # 宽松：允许换行打乱时在全文前 200 行找
        m = _PROCAR_HEADER_RE.search("\n".join(lines[:200]))
    if not m:
        raise ValueError("无法在 PROCAR 头中定位 k-points / bands / ions")
    nkpts, nbands, nions = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if nkpts <= 0 or nbands <= 0 or nions <= 0:
        raise ValueError(f"PROCAR 尺寸无效: nk={nkpts} nb={nbands} nions={nions}")

    want_ions: set[int] | None = None
    if ion_indices:
        want_ions = {int(i) for i in ion_indices if int(i) >= 1}

    kpoints: list[tuple[float, float, float]] = []
    # energies[band][k]
    energies: list[list[float]] = [[0.0] * nkpts for _ in range(nbands)]
    weights: dict[str, list[list[float]]] = {
        key: [[0.0] * nkpts for _ in range(nbands)] for key in ("s", "p", "d", "tot")
    }

    # 扫描：按出现顺序填充
    ik = -1
    ib = -1
    orb_map: dict[str, list[int]] | None = None
    i = 0
    while i < len(lines):
        ln = lines[i]
        km = _KPOINT_RE.search(ln)
        if km:
            ik = int(km.group(1)) - 1
            kx, ky, kz = float(km.group(2)), float(km.group(3)), float(km.group(4))
            if 0 <= ik < nkpts:
                while len(kpoints) <= ik:
                    kpoints.append((0.0, 0.0, 0.0))
                kpoints[ik] = (kx, ky, kz)
            i += 1
            continue

        bm = _BAND_RE.search(ln)
        if bm:
            ib = int(bm.group(1)) - 1
            energy = float(bm.group(2))
            if 0 <= ik < nkpts and 0 <= ib < nbands:
                energies[ib][ik] = energy
            # 读投影表：找表头 ion ...
            j = i + 1
            while j < len(lines):
                raw = lines[j].strip()
                if not raw:
                    j += 1
                    continue
                low = raw.lower()
                if low.startswith("ion") and ("s" in low or "tot" in low):
                    tokens = raw.split()
                    orb_map = _classify_orb_columns(tokens)
                    j += 1
                    break
                if _BAND_RE.search(raw) or _KPOINT_RE.search(raw):
                    break
                j += 1
            else:
                i += 1
                continue

            # 读离子行；遇到 tot 结束本 band（权重一律按所选离子累加，不依赖 tot 行）
            while j < len(lines):
                raw = lines[j].strip()
                if not raw:
                    j += 1
                    continue
                if _BAND_RE.search(raw) or _KPOINT_RE.search(raw):
                    break
                parts = raw.split()
                if not parts:
                    j += 1
                    continue
                tag = parts[0].lower()
                if tag in ("tot", "total"):
                    j += 1
                    break
                try:
                    ion_id = int(parts[0])
                except ValueError:
                    j += 1
                    continue
                if want_ions is not None and ion_id not in want_ions:
                    j += 1
                    continue
                if orb_map is None or not (0 <= ik < nkpts and 0 <= ib < nbands):
                    j += 1
                    continue
                nums: list[float] = []
                for p in parts[1:]:
                    try:
                        nums.append(float(p))
                    except ValueError:
                        break
                for key in ("s", "p", "d", "tot"):
                    if orb_map[key]:
                        weights[key][ib][ik] += _sum_orb(nums, orb_map[key])
                    elif key == "tot" and nums:
                        weights["tot"][ib][ik] += nums[-1]
                j += 1
            i = j
            continue

        i += 1

    if len(kpoints) < nkpts:
        # 补齐缺失 k（极少见）
        while len(kpoints) < nkpts:
            kpoints.append(kpoints[-1] if kpoints else (0.0, 0.0, 0.0))

    dists = [0.0]
    for i in range(1, len(kpoints)):
        dx = kpoints[i][0] - kpoints[i - 1][0]
        dy = kpoints[i][1] - kpoints[i - 1][1]
        dz = kpoints[i][2] - kpoints[i - 1][2]
        dists.append(dists[-1] + math.sqrt(dx * dx + dy * dy + dz * dz))
    total = dists[-1] if dists[-1] > 0 else 1.0
    dists_n = [d / total for d in dists]

    datasets: list[dict[str, Any]] = []
    for ib in range(nbands):
        series = energies[ib]
        data = [e - efermi for e in series] if efermi is not None else list(series)
        datasets.append(
            {
                "label": f"band{ib + 1}",
                "data": data,
                "weights": {
                    "s": weights["s"][ib],
                    "p": weights["p"][ib],
                    "d": weights["d"][ib],
                    "tot": weights["tot"][ib],
                },
            }
        )

    return {
        "kind": "procar",
        "nkpts": nkpts,
        "nbands": nbands,
        "nions": nions,
        "efermi": efermi,
        "labels": [f"{d:.6f}" for d in dists_n],
        "k_distance": dists_n,
        "datasets": datasets,
    }
