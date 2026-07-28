"""
共享工具函数：自动检测文件编码和格式加载 DataFrame + Unicode 归一化
"""
import io
import zipfile

import pandas as pd


# Unicode 上下标 → ASCII（SimHei 字体 Unicode 上标覆盖不全）
_SUPERSCRIPT_MAP = str.maketrans({
    "²": "2", "³": "3", "¹": "1", "⁰": "0",
    "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
    "⁺": "+", "⁻": "-", "⁼": "=",
})
_SUBSCRIPT_MAP = str.maketrans({
    "₂": "2", "₃": "3", "₁": "1", "₀": "0",
    "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
})


def _normalize_label(text: str) -> str:
    """将 Unicode 上下标归一化为 ASCII，避免字体缺字"""
    if not text:
        return text
    out = text.translate(_SUPERSCRIPT_MAP)
    out = out.translate(_SUBSCRIPT_MAP)
    return out


def load_dataframe(data_path: str) -> pd.DataFrame:
    """自动检测文件格式和编码加载数据，支持 CSV、Excel 与 XRD 仪器文本格式"""
    raw = open(data_path, "rb").read()

    # ===== 策略 0: 仪器格式 (.xy/.xyd/.ras/ASCII .raw 等) =====
    try:
        from instrument_io import load_instrument_dataframe

        inst = load_instrument_dataframe(data_path, raw=raw)
        if inst is not None and not inst.empty:
            return inst
    except ValueError:
        raise
    except Exception:
        pass

    # ===== 策略 1: 作为 Excel 打开 =====
    is_zip = raw[:2] == b"PK"
    if is_zip:
        last_err = None
        for eng in ["openpyxl", "xlrd", None]:
            try:
                return pd.read_excel(data_path, engine=eng)
            except Exception as e:
                last_err = e
                continue
        # Excel 引擎失败，从 ZIP 提 CSV
        try:
            with zipfile.ZipFile(data_path) as z:
                csv_files = [n for n in z.namelist() if n.endswith(".csv")]
                if csv_files:
                    with z.open(csv_files[0]) as f:
                        return pd.read_csv(f)
        except Exception:
            pass
        # 文件是 XLSX 但 Excel 引擎都失败
        is_xlsx = data_path.lower().endswith(".xlsx")
        raise ValueError(
            f"无法读取 Excel 文件。请确保安装了 openpyxl: pip install openpyxl"
            if is_xlsx else
            f"无法以 Excel 或 ZIP 格式读取文件: {last_err}"
        )

    # ===== 策略 2: 作为 CSV/文本 =====
    # 先尝试用 latin-1 解码（可以解码任何字节，保证后续 CSV 解析能看到原始内容）
    text = raw.decode("latin-1")

    # 多个分隔符自动检测
    for sep in [",", "\t", ";", "|", " "]:
        try:
            df = pd.read_csv(io.StringIO(text), sep=sep)
            if len(df.columns) >= 1 and len(df) > 0:
                return df
        except Exception:
            continue

    # 自动检测分隔符
    try:
        df = pd.read_csv(io.StringIO(text), sep=None, engine="python")
        if len(df.columns) >= 1 and len(df) > 0:
            return df
    except Exception:
        pass

    # ===== 策略 3: 按编码解码重试（针对非 latin-1 编码的文本） =====
    for encoding in ["utf-8-sig", "utf-8", "gbk", "gb2312", "utf-16"]:
        try:
            decoded = raw.decode(encoding)
        except (UnicodeDecodeError, LookupError):
            continue
        if decoded == text:
            continue  # 和 latin-1 结果一样，跳过
        for sep in [",", "\t", ";", "|", " "]:
            try:
                df = pd.read_csv(io.StringIO(decoded), sep=sep)
                if len(df.columns) >= 1 and len(df) > 0:
                    return df
            except Exception:
                continue

    # ===== 全部失败 =====
    hint = "ZIP/Excel" if is_zip else "CSV"
    preview = raw[:120]
    raise ValueError(
        f"无法以 {hint} 格式读取文件。前120字节: {preview!r}"
    )
