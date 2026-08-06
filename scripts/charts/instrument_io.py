"""
XRD / 光谱仪器文本格式解析（Jade / Origin 常用导出）。

支持：
- .xy / .xyd：两列空白分隔（可含 # ! ; 注释）
- .ras：Rigaku ASCII（*BEGIN DATA 段）
- .raw / .uxd / .dif：若为 ASCII 两列数值则读取；二进制 Bruker RAW 会给出明确错误
- 通用：跳过注释后的两列数值文本
"""
from __future__ import annotations

import io
import os
import re
from typing import Iterable

import numpy as np
import pandas as pd

_COMMENT_RE = re.compile(r"^\s*(#|!|//|;|\*)")
_NUM_RE = re.compile(
    r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$"
)


def _decode_bytes(raw: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "gbk", "latin-1"):
        try:
            return raw.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
    return raw.decode("latin-1", errors="replace")


def _is_number(tok: str) -> bool:
    return bool(_NUM_RE.match(tok.strip()))


def _pairs_from_lines(lines: Iterable[str]) -> list[tuple[float, float]]:
    pairs: list[tuple[float, float]] = []
    for line in lines:
        s = line.strip()
        if not s or _COMMENT_RE.match(s):
            continue
        # Rigaku / UXD 关键字行
        if s.startswith("*") or s.upper().startswith("COUNT") or "=" in s and not s[0].isdigit():
            # 允许以数字开头的数据行；含字母关键字跳过
            if any(c.isalpha() for c in s.replace("E", "").replace("e", "").replace("+", "").replace("-", "")):
                if not _is_number(s.split()[0] if s.split() else ""):
                    continue
        # 去掉行内注释
        for sep in ("#", "!", "//"):
            if sep in s:
                s = s.split(sep, 1)[0].strip()
        if not s:
            continue
        parts = re.split(r"[\s,;]+", s)
        nums: list[float] = []
        for p in parts:
            if not p:
                continue
            try:
                nums.append(float(p))
            except ValueError:
                break
        if len(nums) >= 2:
            pairs.append((nums[0], nums[1]))
    return pairs


def _df_from_pairs(pairs: list[tuple[float, float]]) -> pd.DataFrame:
    if len(pairs) < 2:
        raise ValueError("有效数据点不足（需要 ≥2 行 2θ–Intensity）")
    arr = np.asarray(pairs, dtype=float)
    return pd.DataFrame({"two_theta": arr[:, 0], "intensity": arr[:, 1]})


def parse_xy_text(text: str) -> pd.DataFrame:
    return _df_from_pairs(_pairs_from_lines(text.splitlines()))


def parse_ras_text(text: str) -> pd.DataFrame:
    """Rigaku .ras：优先取 *BEGIN 之后的数据段。"""
    lines = text.splitlines()
    in_data = False
    data_lines: list[str] = []
    for line in lines:
        u = line.strip().upper()
        if u.startswith("*BEGIN") or u == "*DATA" or "BEGIN DATA" in u:
            in_data = True
            continue
        if u.startswith("*END"):
            in_data = False
            continue
        if in_data:
            data_lines.append(line)
    if data_lines:
        return _df_from_pairs(_pairs_from_lines(data_lines))
    return parse_xy_text(text)


def looks_like_binary_raw(raw: bytes) -> bool:
    if len(raw) < 16:
        return False
    # Bruker RAW 常见以 RAW 魔数或高比例空字节/控制符
    head = raw[:8]
    if head[:3] == b"RAW" or head[:4] == b"RAW1":
        return True
    sample = raw[:4096]
    # NUL 较多 → 二进制
    if sample.count(0) > max(8, len(sample) // 50):
        return True
    textish = sum(1 for b in sample if 9 <= b <= 13 or 32 <= b <= 126)
    return textish / max(len(sample), 1) < 0.75


def load_instrument_dataframe(data_path: str, raw: bytes | None = None) -> pd.DataFrame | None:
    """
    按扩展名尝试仪器格式。无法识别返回 None（交给通用 CSV 逻辑）。
    """
    ext = os.path.splitext(data_path)[1].lower()
    if ext not in {".xy", ".xyd", ".ras", ".raw", ".uxd", ".dif", ".mdi"}:
        return None

    if raw is None:
        with open(data_path, "rb") as f:
            raw = f.read()

    if ext in {".raw", ".mdi"} and looks_like_binary_raw(raw):
        raise ValueError(
            f"检测到二进制仪器文件（{ext}）。请先在 Jade/仪器软件中导出为 .xy / .csv / ASCII .raw 后再上传。"
        )

    text = _decode_bytes(raw)
    if ext == ".ras":
        return parse_ras_text(text)
    return parse_xy_text(text)


def dataframe_to_xy_csv_bytes(df: pd.DataFrame) -> bytes:
    """规范化为两列表头 CSV，供下游脚本统一读取。"""
    if df.shape[1] < 2:
        raise ValueError("需要两列数据")
    out = df.iloc[:, :2].copy()
    out.columns = ["two_theta", "intensity"]
    buf = io.StringIO()
    out.to_csv(buf, index=False)
    return buf.getvalue().encode("utf-8")
