"""
通用数据图表生成脚本（matplotlib）
用法: python plot_generic.py --data <csv_path> --config <json_path> --output <png_path>

config JSON 格式:
{
  "chart_type": "bar" | "line" | "scatter" | "pie",
  "title": "图表标题",
  "x_column": "X轴列名",
  "y_column": "Y轴列名",
  "x_label": "X轴标签",
  "y_label": "Y轴标签",
  "color": "#4A90D9"
}
"""

import argparse
import json
import os
import sys
import traceback

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

# 确保能导入同目录下的共享模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from font_setup import apply_cjk_font_rcparams  # noqa: E402
from plot_utils import load_dataframe, _normalize_label
from plot_style import resolve_style, validate_style  # noqa: E402


def _ok_payload(output_path: str, config: dict, series_count: int = 0) -> dict:
    payload: dict = {"status": "ok", "output": output_path}
    try:
        style = resolve_style(config if isinstance(config, dict) else {})
        if series_count > 0:
            style["_series_count"] = series_count
        payload["styleValidation"] = validate_style(style)
        payload["fig_width"] = style.get("fig_width")
        payload["columns"] = style.get("columns")
        payload["preset"] = style.get("preset")
    except Exception:
        pass
    try:
        from qa_report import get_last_qa
        payload["qaReport"] = get_last_qa()
    except Exception:
        pass
    return payload  # noqa: E402

apply_cjk_font_rcparams()


def _rgba_to_mpl(rgba_str):
    """将 Chart.js rgba() 转为 matplotlib 可识别的颜色"""
    if not isinstance(rgba_str, str) or not rgba_str.startswith("rgba"):
        return rgba_str
    import re
    m = re.match(r"rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)", rgba_str)
    if not m:
        return rgba_str
    return (int(m.group(1)) / 255, int(m.group(2)) / 255, int(m.group(3)) / 255, float(m.group(4)))


# 旧 chart_type → 注册表 ID 映射（向后兼容）
_CHART_TYPE_MAP = {
    "bar": "bar_grouped",
    "bar_grouped": "bar_grouped",
    "stacked_bar": "bar_stacked",
    "bar_stacked": "bar_stacked",
    "pct_stacked": "bar_pct_stacked",
    "bar_pct_stacked": "bar_pct_stacked",
    "line": "line",
    "scatter": "scatter",
    "pie": "pie",
    "heatmap": "heatmap",
    "area": "area",
    "forest": "forest",
    "radar": "radar",
    "stack_offset": "stack_offset",
    "waterfall": "stack_offset",
    "dft_band": "dft_band",
    "dft_dos": "dft_dos",
    "band": "dft_band",
    "dos": "dft_dos",
}

# 惰性加载模块映射
_module_map = None


def _get_module_map():
    global _module_map
    if _module_map is None:
        from chart_base import get_module_map
        _module_map = get_module_map()
    return _module_map


def _dispatch_chart(chart_type: str, labels, datasets, config, output_path):
    """根据注册表分发图表生成"""
    # 映射旧名称 → 注册 ID
    chart_id = _CHART_TYPE_MAP.get(chart_type, chart_type)
    modules = _get_module_map()

    if chart_id in modules:
        mod_class = modules[chart_id]
        mod = mod_class()
        err = mod.validate(labels, datasets, config)
        if err:
            print(json.dumps({"status": "error", "message": f"数据验证失败: {err}"}))
            sys.exit(1)
        mod.plot(labels, datasets, config, output_path)
        return

    # 降级：注册表中找不到，用旧的 _plot_inline_legacy
    _plot_inline_legacy(labels, datasets, config, output_path)


def _plot_inline_legacy(labels, datasets, config, output_path):
    """旧版内联数据绘制（注册表中找不到对应模块时的降级方案）"""
    import matplotlib.pyplot as plt
    chart_type = config.get("chart_type") or config.get("type", "bar")
    title = _normalize_label(config.get("title", ""))
    x_label = _normalize_label(config.get("x_label", ""))
    y_label = _normalize_label(config.get("y_label", ""))

    labels = [_normalize_label(str(lbl)) for lbl in labels]
    academic_colors = [
        "#2C3E50", "#C0392B", "#2980B9", "#27AE60",
        "#8E44AD", "#D35400", "#16A085", "#E67E22",
    ]

    fig, ax = plt.subplots(figsize=(8, 4.8))

    if chart_type == "line":
        for i, ds in enumerate(datasets):
            c = academic_colors[i % len(academic_colors)]
            d = list(ds.get("data", []))[:len(labels)]
            ax.plot(range(len(labels)), d, color=c, marker="o", linewidth=2, label=ds.get("label", ""))
    else:
        n = len(datasets)
        bar_w = 0.75 / max(n, 1)
        for i, ds in enumerate(datasets):
            c = academic_colors[i % len(academic_colors)]
            d = list(ds.get("data", []))[:len(labels)]
            offset = (i - (n - 1) / 2) * bar_w
            ax.bar([p + offset for p in range(len(labels))], d, width=bar_w * 0.88, color=c, label=ds.get("label", ""))

    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels(labels, fontsize=9)
    if x_label: ax.set_xlabel(x_label, fontsize=12)
    if y_label: ax.set_ylabel(y_label, fontsize=12)
    ax.set_title(title, fontsize=13, fontweight="bold")
    if len(datasets) > 1: ax.legend(fontsize=9)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis="y", alpha=0.25)
    from layout_solver import run_layout_and_save
    from plot_style import resolve_style as _resolve_style
    run_layout_and_save(fig, output_path, _resolve_style(config), config)


def plot_chart(data_path: str, config: dict, output_path: str):
    chart_type = config.get("chart_type") or config.get("type", "bar")

    # 内联数据模式（Chart.js 风格 JSON）
    inline_data = config.get("data")
    if inline_data and "labels" in inline_data and "datasets" in inline_data:
        labels = inline_data["labels"]
        datasets = inline_data["datasets"]
        _dispatch_chart(chart_type, labels, datasets, config, output_path)
        print(json.dumps(_ok_payload(output_path, config, len(datasets)), ensure_ascii=False))
        return

    # CSV 文件模式 — 转成内联格式后统一调度
    df = load_dataframe(data_path)
    if df.empty:
        print(json.dumps({"status": "error", "message": "数据文件为空或无法解析"}))
        sys.exit(1)

    labels = df.iloc[:, 0].astype(str).tolist()
    # 误差列配对：产量_sd / 产量_err → 挂到「产量」
    error_suffixes = ("_sd", "_sem", "_se", "_err", "_std", "_ci")
    headers = [str(c) for c in df.columns]
    value_indices: list[int] = []
    error_map: dict[int, int] = {}
    for col_idx in range(1, len(headers)):
        h = headers[col_idx]
        lower = h.lower()
        matched = next((s for s in error_suffixes if lower.endswith(s)), None)
        if matched:
            base = h[: -len(matched)]
            base_idx = next(
                (i for i in range(1, len(headers)) if i != col_idx and headers[i] == base),
                None,
            )
            if base_idx is not None:
                error_map[base_idx] = col_idx
            continue
        value_indices.append(col_idx)

    datasets = []
    for col_idx in value_indices:
        vals = pd.to_numeric(df.iloc[:, col_idx], errors="coerce").fillna(0).tolist()
        entry: dict = {"label": headers[col_idx], "data": vals}
        err_idx = error_map.get(col_idx)
        if err_idx is not None:
            errs = pd.to_numeric(df.iloc[:, err_idx], errors="coerce").fillna(0).tolist()
            entry["errors"] = errs
        datasets.append(entry)

    _dispatch_chart(chart_type, labels, datasets, config, output_path)
    print(json.dumps(_ok_payload(output_path, config, len(datasets)), ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, help="CSV 数据文件路径")
    parser.add_argument("--config", required=True, help="JSON 配置文件路径")
    parser.add_argument("--output", required=True, help="输出 PNG 路径")
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8-sig") as f:
        cfg = json.load(f)

    try:
        plot_chart(args.data, cfg, args.output)
    except Exception as e:
        err_msg = json.dumps({"status": "error", "message": str(e)})
        print(err_msg)  # to stdout (captured by API)
        print(err_msg, file=sys.stderr)  # to stderr (also captured)
        sys.stderr.flush()
        sys.exit(1)
