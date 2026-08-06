"""matplotlib 中英文字体栈 — 避免 Arial 优先导致中文缺字。"""
from __future__ import annotations

from matplotlib import font_manager

# 按平台常见字体排序；拉丁字体仅作 fallback，不可置顶
_PREFERRED_SANS = [
    "Microsoft YaHei",
    "Microsoft YaHei UI",
    "SimHei",
    "SimSun",
    # 新版 Noto / Source Han 在 Windows 上常注册为无 “CJK” 后缀的族名
    "Noto Sans SC",
    "Noto Sans CJK SC",
    "Noto Sans CJK JP",
    "Noto Sans CJK TC",
    "Noto Serif SC",
    "Source Han Sans CN",
    "Source Han Sans SC",
    "WenQuanYi Micro Hei",
    "PingFang SC",
    "Heiti SC",
    "STHeiti",
    "STXihei",
    "Arial Unicode MS",
    "Arial",
    "Helvetica",
    "Liberation Sans",
    "DejaVu Sans",
]


def _installed_font_names() -> set[str]:
    return {f.name for f in font_manager.fontManager.ttflist}


def build_sans_serif_stack() -> list[str]:
    """返回已安装字体优先的 sans-serif 列表，确保 CJK 在拉丁字体之前。"""
    installed = _installed_font_names()
    stack: list[str] = []

    for name in _PREFERRED_SANS:
        if name in installed and name not in stack:
            stack.append(name)

    # 模糊匹配：如 "Microsoft YaHei" 与 "Microsoft YaHei UI" 等
    if not any(
        any(k in s for k in ("YaHei", "SimHei", "CJK", "PingFang", "Noto Sans SC", "Source Han", "STXihei"))
        for s in stack
    ):
        for avail in sorted(installed):
            lower = avail.lower()
            if any(
                key in lower
                for key in (
                    "yahei",
                    "simhei",
                    "simsun",
                    "cjk",
                    "noto sans sc",
                    "noto serif sc",
                    "pingfang",
                    "heiti",
                    "wenquanyi",
                    "source han",
                    "stxihei",
                )
            ):
                if avail not in stack:
                    stack.append(avail)

    for name in _PREFERRED_SANS:
        if name not in stack:
            stack.append(name)

    if "DejaVu Sans" not in stack:
        stack.append("DejaVu Sans")

    return stack


def apply_cjk_font_rcparams() -> str:
    """写入 rcParams['font.sans-serif']，返回首选字体名（调试用）。"""
    import matplotlib.pyplot as plt

    stack = build_sans_serif_stack()
    plt.rcParams["font.family"] = "sans-serif"
    plt.rcParams["font.sans-serif"] = stack
    plt.rcParams["axes.unicode_minus"] = False
    return stack[0] if stack else "DejaVu Sans"
