"""面积图 — 堆叠 fill_between 趋势（对齐 nature-figure fill-between 模式）"""
from chart_base import ChartModule
from plot_utils import _normalize_label


class AreaChart(ChartModule):
    id = "area"

    def plot(self, labels, datasets, config, output_path):
        style = self.prepare(config)
        labels_display = [_normalize_label(str(lbl)) for lbl in labels]
        title = config.get("title", "")
        x_label = config.get("x_label", "")
        y_label = config.get("y_label", "")
        stacked = config.get("area_stacked") not in (False, "false", "0", 0)

        numeric_x = None
        try:
            numeric_x = [float(str(lbl)) for lbl in labels]
        except (ValueError, TypeError):
            numeric_x = None

        fig, ax = self.new_figure(style)
        colors = self.colors(style, len(datasets))
        alpha = 0.35 if stacked else 0.25
        lw = max(float(style.get("axes_linewidth", 0.8)) * 2, 1.5)

        if numeric_x is not None:
            x_vals = numeric_x
        else:
            x_vals = list(range(len(labels)))

        if stacked:
            bottom = [0.0] * len(labels)
            for i, ds in enumerate(datasets):
                c = colors[i]
                d = list(ds.get("data", []))[:len(labels)]
                while len(d) < len(labels):
                    d.append(0)
                lbl = _normalize_label(ds.get("label", ""))
                top = [bottom[j] + d[j] for j in range(len(labels))]
                ax.fill_between(x_vals, bottom, top, color=c, alpha=alpha, label=lbl or None)
                ax.plot(x_vals, top, color=c, linewidth=lw, zorder=3)
                bottom = top
        else:
            for i, ds in enumerate(datasets):
                c = colors[i]
                d = list(ds.get("data", []))[:len(labels)]
                while len(d) < len(labels):
                    d.append(0)
                lbl = _normalize_label(ds.get("label", ""))
                ax.fill_between(x_vals, 0, d, color=c, alpha=alpha, label=lbl or None)
                ax.plot(x_vals, d, color=c, linewidth=lw, zorder=3)

        if numeric_x is None:
            ax.set_xticks(range(len(labels)))
            ax.set_xticklabels(labels_display, rotation=20, ha="right")
        else:
            ax.set_xticklabels(labels_display)

        self.finalize_axes(
            ax, style, config=config, title=title, x_label=x_label, y_label=y_label,
            has_legend=len(datasets) > 1,
        )
        self.save(fig, output_path, style)
