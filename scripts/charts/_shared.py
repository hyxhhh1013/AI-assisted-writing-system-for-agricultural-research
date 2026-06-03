"""图表脚本共享工具 — 中文字体 + Unicode 上下标归一化"""
import matplotlib.pyplot as plt

# 中文字体 — 优先系统可用字体，跨平台兼容
plt.rcParams["font.sans-serif"] = [
    "Noto Sans CJK JP", "Noto Serif CJK JP",     # Linux
    "SimHei", "Microsoft YaHei",                   # Windows
    "PingFang SC", "Heiti SC",                     # macOS
    "DejaVu Sans",
]
plt.rcParams["axes.unicode_minus"] = False

# Unicode 上下标 → ASCII（SimHei 对 Unicode 上标覆盖不全）
_SUP_MAP = str.maketrans({
    "²": "2", "³": "3", "¹": "1", "⁰": "0",
    "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
    "⁺": "+", "⁻": "-", "⁼": "=",
})
_SUB_MAP = str.maketrans({
    "₂": "2", "₃": "3", "₁": "1", "₀": "0",
    "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
})


def normalize_label(text: str) -> str:
    """将 Unicode 上下标归一化为 ASCII"""
    out = text.translate(_SUP_MAP)
    out = out.translate(_SUB_MAP)
    return out
