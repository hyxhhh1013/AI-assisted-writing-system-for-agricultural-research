"""Offset 堆叠谱 / 瀑布图 — Origin 光谱对比常用"""
from chart_base import ChartModule
from plot_utils import _normalize_label

_MARKERS = {"diamond": "D", "triangle": "^", "star": "*", "circle": "o"}
_MARKER_CYCLE = ("D", "^", "*", "o")


def _flag(value):
    return value in (True, "true", "1", 1)


def _marker_style(name, index):
    return _MARKERS.get(str(name or "").strip().lower(), _MARKER_CYCLE[index % 4])


def _pick_series(plotted, x, series_name):
    import numpy as np

    chosen = None
    key = str(series_name or "").strip().lower()
    if key:
        for item in plotted:
            if str(item[0]).strip().lower() == key:
                chosen = item
                break
    if chosen is None:
        best = None
        for item in plotted:
            xs, y_raw = item[1], item[2]
            idx = int(np.argmin(np.abs(xs - x)))
            height = float(y_raw[idx])
            if best is None or height > best[0]:
                best = (height, item)
        chosen = best[1] if best else None
    if chosen is None:
        return None
    xs, _raw, y_plot, color = chosen[1], chosen[2], chosen[3], chosen[4]
    idx = int(np.argmin(np.abs(xs - x)))
    return float(xs[idx]), float(y_plot[idx]), color


def _as_list(value):
    if isinstance(value, list):
        return value
    if isinstance(value, str) and value.strip().startswith("["):
        import json
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return []
        return parsed if isinstance(parsed, list) else []
    return []


def _draw_marks(ax, plotted, config, fs):
    peaks = _as_list(config.get("peaks"))
    if isinstance(peaks, list):
        for i, peak in enumerate(peaks):
            if not isinstance(peak, dict):
                continue
            try:
                x = float(peak.get("x"))
            except (TypeError, ValueError):
                continue
            hit = _pick_series(plotted, x, peak.get("series"))
            if hit is None:
                continue
            px, py, color = hit
            style = _marker_style(peak.get("marker"), i)
            ax.plot(
                px, py, linestyle="none", marker=style, color=color,
                markersize=9 if style == "*" else 6, zorder=5,
            )
            label = _normalize_label(str(peak.get("label") or ""))
            if label:
                ax.text(px, py, f"  {label}", fontsize=fs, va="bottom", ha="left", zorder=5)

    guides = _as_list(config.get("guides"))
    if isinstance(guides, list) and guides:
        ymin, ymax = ax.get_ylim()
        pad = (ymax - ymin) * 0.08 if ymax > ymin else 0.2
        ax.set_ylim(ymin, ymax + pad)
        for guide in guides:
            if not isinstance(guide, dict):
                continue
            try:
                x = float(guide.get("x"))
            except (TypeError, ValueError):
                continue
            ax.axvline(x, color="#666666", linestyle="--", linewidth=0.6, zorder=1)
            label = _normalize_label(str(guide.get("label") or ""))
            if label:
                ax.text(
                    x, ymax + pad * 0.15, label,
                    ha="center", va="bottom", fontsize=fs, color="#333333", rotation=90,
                )


class StackOffsetChart(ChartModule):
    id = "stack_offset"

    def validate(self, labels, datasets, config):
        if not labels:
            return "数据为空"
        if not datasets:
            return "缺少数据集"
        return None

    def plot(self, labels, datasets, config, output_path):
        import numpy as np

        style = self.prepare(config)
        title = config.get("title", "")
        x_label = config.get("x_label", "")
        y_label = config.get("y_label", "Intensity (a.u.)")
        offset_frac = float(config.get("offset", 0.2))
        normalize = config.get("normalize", True) in (True, "true", "1", 1)
        x_reverse = _flag(config.get("x_reverse"))

        numeric_x = None
        try:
            numeric_x = [float(str(lbl)) for lbl in labels]
        except (ValueError, TypeError):
            numeric_x = list(range(len(labels)))

        fig, ax = self.new_figure(style)
        colors = self.colors(style, len(datasets))
        lw = max(float(style.get("axes_linewidth", 0.8)) * 1.5, 1.0)
        fs = max(float(style.get("font_size", 8)) - 1, 6)
        show_labels = config.get("series_labels") in (True, "true", "1", 1) or (
            config.get("series_labels") is None and len(datasets) > 1
        )

        plotted = []
        xs = np.asarray(numeric_x, dtype=float)
        for i, ds in enumerate(datasets):
            d = list(ds.get("data", []))[: len(labels)]
            while len(d) < len(labels):
                d.append(0)
            y = np.asarray(d, dtype=float)
            if normalize:
                y_min, y_max = float(np.min(y)), float(np.max(y))
                span = y_max - y_min
                y = (y - y_min) / span if span > 0 else y * 0
                base = 1.0
            else:
                base = float(np.max(np.abs(y))) or 1.0
            y_plot = y + i * offset_frac * base
            lbl = _normalize_label(ds.get("label", ""))
            ax.plot(xs, y_plot, color=colors[i], linewidth=lw, label=lbl or None)
            plotted.append((lbl, xs, y, y_plot, colors[i]))
            if show_labels and lbl:
                # 红外横轴从高到低时，样品名放在低波数一侧（反转后的右侧）
                label_at = 0 if x_reverse else -1
                ax.text(
                    xs[label_at], y_plot[label_at], f"  {lbl}",
                    color=colors[i], fontsize=fs, va="center", ha="left", zorder=4,
                )

        self.finalize_axes(
            ax,
            style,
            config=config,
            title=title,
            x_label=x_label,
            y_label=y_label,
            has_legend=not show_labels and len(datasets) > 1,
            grid_axis="both",
        )
        if normalize or len(datasets) > 1:
            ax.set_yticklabels([])
        _draw_marks(ax, plotted, config, fs)
        if x_reverse:
            ax.invert_xaxis()
        if show_labels:
            style["_series_label_margin"] = True
        self.save(fig, output_path, style)
