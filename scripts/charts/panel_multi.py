"""多面板复合图 — 期刊级 a/b/c 面板组合。

用法: python panel_multi.py --config <json_path> --output <png_path>

config JSON:
{
  "title": "图1 不同处理对作物产量的影响",
  "preset": "nature",
  "panels": [
    {"chartType": "bar_grouped", "csv": "处理,产量,产量_sd\\n对照,12.3,1.2\\n处理A,15.7,0.9", "title": "", "x_label": "处理", "y_label": "产量 (kg/ha)"},
    {"chartType": "line", "csv": "天数,N2,CO2\\n1,10,20\\n2,15,25", "title": "", "x_label": "天数", "y_label": "浓度"}
  ]
}

每个面板复用 plot_generic 的 CSV→labels/datasets 解析（含 _sd/_se/_ci 误差棒配对），
渲染成独立子图后按网格拼合，左上角加 a/b/c 面板标号。
"""

import argparse
import io
import json
import os
import sys
import tempfile

import matplotlib

matplotlib.use("Agg")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from font_setup import apply_cjk_font_rcparams  # noqa: E402
from plot_generic import _dispatch_chart, _CHART_TYPE_MAP  # noqa: E402

apply_cjk_font_rcparams()

MAX_PANELS = 6
ERROR_SUFFIXES = ("_sd", "_sem", "_se", "_err", "_std", "_ci")


def parse_csv(csv_text: str):
    """复用 plot_generic 的 CSV → labels/datasets（误差棒挂到基础列）。"""
    import pandas as pd

    df = pd.read_csv(io.StringIO(csv_text))
    if df.empty or len(df.columns) < 2:
        raise ValueError("CSV 至少需要两列（标签 + 数据）")

    labels = df.iloc[:, 0].astype(str).tolist()
    headers = [str(c) for c in df.columns]
    value_indices: list[int] = []
    error_map: dict[int, int] = {}
    for col_idx in range(1, len(headers)):
        h = headers[col_idx]
        lower = h.lower()
        matched = next((s for s in ERROR_SUFFIXES if lower.endswith(s)), None)
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

    return labels, datasets


def _panel_label(i: int) -> str:
    return chr(ord("a") + i)


def _place_panels(spans, cols):
    """按列数和跨列摆面板。span=2 只在 cols>=2 且当前行放得下时生效。"""
    positions = []
    row, col = 0, 0
    for span in spans:
        width = 2 if cols >= 2 and span == 2 else 1
        if col + width > cols:
            row += 1
            col = 0
        positions.append((row, col, width))
        col += width
        if col >= cols:
            row += 1
            col = 0
    rows = row if col == 0 else row + 1
    return positions, rows


def _composite(images, config, spans):
    """把子图按网格拼合成期刊复合图，左上角加 a/b/c 标号。"""
    from PIL import Image, ImageDraw, ImageFont
    from matplotlib import font_manager

    n = len(images)
    raw_cols = config.get("cols")
    if raw_cols in (1, 2, 3, "1", "2", "3"):
        cols = int(raw_cols)
    else:
        cols = 3 if n >= 4 else (2 if n >= 2 else 1)
    positions, rows = _place_panels(spans, cols)
    CELL_W = 1000
    gap = 44
    pad = 26
    title = str(config.get("title", "") or "")
    title_h = 74 if title else 0

    font_path = font_manager.findfont("DejaVu Sans")
    label_font = ImageFont.truetype(font_path, 46)
    title_font = ImageFont.truetype(font_path, 40)

    scaled = []
    for img, (_row, _col, width) in zip(images, positions):
        target_w = width * CELL_W + (width - 1) * gap
        w, h = img.size
        scale = target_w / max(w, 1)
        scaled.append(img.resize((target_w, max(int(h * scale), 1)), Image.LANCZOS))

    row_h = [1] * max(rows, 1)
    for cell, (row, _col, _width) in zip(scaled, positions):
        row_h[row] = max(row_h[row], cell.size[1])

    W = cols * CELL_W + (cols - 1) * gap + 2 * pad
    H = sum(row_h) + max(rows - 1, 0) * gap + 2 * pad + title_h
    canvas = Image.new("RGB", (W, H), "white")
    draw = ImageDraw.Draw(canvas)
    if title:
        draw.text((pad, 12), title, fill="#111111", font=title_font)

    y_cursor = [pad + title_h]
    for r in range(1, rows):
        y_cursor.append(y_cursor[-1] + row_h[r - 1] + gap)

    for i, (cell, (row, col, _width)) in enumerate(zip(scaled, positions)):
        x = pad + col * (CELL_W + gap)
        y = y_cursor[row]
        canvas.paste(cell, (x, y))
        draw.text((x + 8, y + 6), _panel_label(i), fill="#111111", font=label_font)

    return canvas


def main():
    parser = argparse.ArgumentParser(description="Multi-panel composite figure")
    parser.add_argument("--config", required=True, help="JSON 配置路径")
    parser.add_argument("--output", required=True, help="输出 PNG 路径")
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8-sig") as f:
        cfg = json.load(f)

    try:
        panels = cfg.get("panels", [])
        if not panels or not isinstance(panels, list):
            print(json.dumps({"status": "error", "message": "panels 为空"}))
            sys.exit(1)
        if len(panels) > MAX_PANELS:
            print(json.dumps({"status": "error", "message": f"最多 {MAX_PANELS} 个面板"}))
            sys.exit(1)

        preset = str(cfg.get("preset", "nature"))
        with tempfile.TemporaryDirectory() as tmp:
            images = []
            for i, p in enumerate(panels):
                if not isinstance(p, dict):
                    raise ValueError(f"面板 {i + 1} 不是对象")
                chart_type = str(p.get("chartType") or p.get("chart_type") or "bar_grouped")
                chart_id = _CHART_TYPE_MAP.get(chart_type, chart_type)
                csv_text = str(p.get("csv", "") or "")
                if not csv_text.strip():
                    raise ValueError(f"面板 {i + 1}（{chart_id}）缺 csv 数据")

                labels, datasets = parse_csv(csv_text)
                if not labels or not datasets:
                    raise ValueError(f"面板 {i + 1}（{chart_id}）数据解析失败")

                style = {}
                palette = str(p.get("palette") or "").strip()
                if palette:
                    style["palette"] = palette
                is_stack = chart_id == "stack_offset"
                sub_cfg = {
                    "title": str(p.get("title", "") or ""),
                    "x_label": str(p.get("x_label") or p.get("xLabel") or ""),
                    "y_label": str(p.get("y_label") or p.get("yLabel") or ""),
                    "preset": preset,
                    "show_values": False if is_stack else True,
                    "columns": 1,
                    "y_min": p.get("y_min", p.get("yMin")),
                    "y_max": p.get("y_max", p.get("yMax")),
                    "show_legend": p.get("show_legend", p.get("showLegend", not is_stack)),
                }
                if is_stack:
                    sub_cfg["offset"] = p.get("offset", 0.9)
                    sub_cfg["normalize"] = p.get("normalize", True)
                    sub_cfg["series_labels"] = p.get("series_labels", p.get("seriesLabels", False))
                    sub_cfg["x_reverse"] = p.get("x_reverse", p.get("xReverse", False))
                    if p.get("peaks"):
                        sub_cfg["peaks"] = p.get("peaks")
                    if p.get("guides"):
                        sub_cfg["guides"] = p.get("guides")
                if style:
                    sub_cfg["style"] = style
                out = os.path.join(tmp, f"panel_{i}.png")
                _dispatch_chart(chart_id, labels, datasets, sub_cfg, out)

                from PIL import Image

                images.append(Image.open(out).convert("RGB"))

        if not images:
            raise ValueError("没有可拼合的面板")

        spans = [
            2 if isinstance(p, dict) and p.get("span") in (2, "2") else 1
            for p in panels
        ]
        composite = _composite(images, cfg, spans)
        composite.save(args.output)

        print(json.dumps(
            {
                "status": "ok",
                "output": args.output,
                "panelCount": len(images),
                "preset": preset,
            },
            ensure_ascii=False,
        ))
    except Exception as e:
        msg = json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False)
        print(msg)
        print(msg, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
