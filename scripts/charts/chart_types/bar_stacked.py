"""堆积柱状图 — 各部分绝对值的堆叠构成"""
from chart_base import ChartModule
from plot_utils import _normalize_label


class StackedBarChart(ChartModule):
    id = "bar_stacked"

    def plot(self, labels, datasets, config, output_path):
        style = self.prepare(config)
        labels = [_normalize_label(str(lbl)) for lbl in labels]
        title = config.get("title", "")
        x_label = config.get("x_label", "")
        y_label = config.get("y_label", "")

        fig, ax = self.new_figure(style)
        bar_w = 0.65
        bottom_vals = [0.0] * len(labels)
        colors = self.colors(style, len(datasets))
        bk = self.bar_kwargs(style)

        for i, ds in enumerate(datasets):
            c = colors[i]
            d = list(ds.get("data", []))[:len(labels)]
            while len(d) < len(labels):
                d.append(0)
            lbl = _normalize_label(ds.get("label", ""))
            x_pos = range(len(labels))
            btm = bottom_vals if i > 0 else None
            bars = ax.bar(
                x_pos, d, width=bar_w, bottom=btm,
                color=c, label=lbl or None, alpha=0.92, zorder=3, **bk,
            )
            if i == len(datasets) - 1:
                self.annotate_bar_values(ax, bars, style)
            bottom_vals = [bottom_vals[j] + d[j] for j in range(len(labels))]

        ax.set_xticks(range(len(labels)))
        ax.set_xticklabels(labels)
        self.finalize_axes(
            ax, style, config=config, title=title, x_label=x_label, y_label=y_label,
            has_legend=len(datasets) > 1,
        )
        self.save(fig, output_path, style)
