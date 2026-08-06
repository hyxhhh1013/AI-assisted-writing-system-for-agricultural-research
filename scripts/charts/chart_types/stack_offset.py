"""Offset 堆叠谱 / 瀑布图 — Origin 光谱对比常用"""
from chart_base import ChartModule
from plot_utils import _normalize_label


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
            ax.plot(numeric_x, y_plot, color=colors[i], linewidth=lw, label=lbl or None)
            if show_labels and lbl:
                # 右侧谱线标签（取谱线末端 y，贴近曲线）
                ax.text(
                    numeric_x[-1], y_plot[-1], f"  {lbl}",
                    color=colors[i], fontsize=fs, va="center", ha="left", zorder=4,
                )

        self.finalize_axes(
            ax,
            style,
            config=config,
            title=title,
            x_label=x_label,
            y_label=y_label,
            has_legend=len(datasets) > 1,
            grid_axis="both",
        )
        if normalize or len(datasets) > 1:
            ax.set_yticklabels([])
        self.save(fig, output_path, style)
