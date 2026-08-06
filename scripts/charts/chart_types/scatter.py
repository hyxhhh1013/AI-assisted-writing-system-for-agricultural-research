"""散点图 — 展示两个变量之间的相关关系"""
from chart_base import ChartModule
from plot_utils import _normalize_label


class ScatterChart(ChartModule):
    id = "scatter"

    def plot(self, labels, datasets, config, output_path):
        style = self.prepare(config)
        labels_display = [_normalize_label(str(lbl)) for lbl in labels]
        title = config.get("title", "")
        x_label = config.get("x_label", "")
        y_label = config.get("y_label", "")

        numeric_x = None
        try:
            numeric_x = [float(str(lbl)) for lbl in labels]
        except (ValueError, TypeError):
            numeric_x = None

        fig, ax = self.new_figure(style)
        colors = self.colors(style, len(datasets))
        ms = max(float(style.get("font_size", 8)) * 8, 36)

        for i, ds in enumerate(datasets):
            c = colors[i]
            d = list(ds.get("data", []))[:len(labels)]
            while len(d) < len(labels):
                d.append(0)
            lbl = _normalize_label(ds.get("label", ""))

            if numeric_x is not None:
                x_vals = numeric_x
            else:
                x_vals = list(range(len(labels)))

            ax.scatter(
                x_vals, d, c=c, s=ms, alpha=0.85,
                edgecolors="white" if not style.get("bar_edge") else "black",
                linewidth=0.5, label=lbl or None, zorder=3,
            )
            if config.get("show_trendline") in (True, "true", "1", 1) and len(x_vals) >= 2:
                import numpy as np
                coeffs = np.polyfit(x_vals, d[:len(x_vals)], 1)
                trend_x = np.array(x_vals, dtype=float)
                ax.plot(trend_x, np.polyval(coeffs, trend_x), color=c, linestyle="--", linewidth=1.2, alpha=0.7, zorder=2)

        if numeric_x is None:
            ax.set_xticks(range(len(labels)))
            ax.set_xticklabels(labels_display)
        else:
            ax.set_xticklabels(labels_display)

        self.finalize_axes(
            ax, style, config=config, title=title, x_label=x_label, y_label=y_label,
            has_legend=len(datasets) > 1, grid_axis="both",
        )
        self.save(fig, output_path, style)
