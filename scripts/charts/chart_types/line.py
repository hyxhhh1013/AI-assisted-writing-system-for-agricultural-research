"""折线图 — 展示数值随变量变化的连续趋势，支持误差阴影"""
from chart_base import ChartModule
from plot_utils import _normalize_label


class LineChart(ChartModule):
    id = "line"

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
        lw = max(float(style.get("axes_linewidth", 0.8)) * 2, 1.5)
        ms = max(float(style.get("font_size", 8)) * 0.6, 4)

        for i, ds in enumerate(datasets):
            c = colors[i]
            d = list(ds.get("data", []))[:len(labels)]
            while len(d) < len(labels):
                d.append(0)
            lbl = _normalize_label(ds.get("label", ""))
            yerr = self.dataset_errors(ds, len(labels))

            if numeric_x is not None:
                x_vals = numeric_x
            else:
                x_vals = list(range(len(labels)))

            ax.plot(
                x_vals, d, color=c, marker="o", linewidth=lw, markersize=ms,
                label=lbl or None, zorder=3,
            )
            if yerr:
                ax.errorbar(
                    x_vals, d, yerr=yerr, fmt="none", ecolor=c,
                    elinewidth=lw * 0.6, capsize=ms * 0.5, alpha=0.85,
                )
            if config.get("show_shadow") in (True, "true", "1", 1) and yerr:
                import numpy as np
                lo = [d[j] - yerr[j] for j in range(len(d))]
                hi = [d[j] + yerr[j] for j in range(len(d))]
                ax.fill_between(x_vals, lo, hi, color=c, alpha=0.12, zorder=2)

        if numeric_x is None:
            ax.set_xticks(range(len(labels)))
            ax.set_xticklabels(labels_display)
        else:
            ax.set_xticklabels(labels_display)

        self.finalize_axes(
            ax, style, config=config, title=title, x_label=x_label, y_label=y_label,
            has_legend=len(datasets) > 1,
        )
        self.save(fig, output_path, style)
