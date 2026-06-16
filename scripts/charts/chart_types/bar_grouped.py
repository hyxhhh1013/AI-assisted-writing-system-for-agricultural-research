"""分组柱状图 — 多组数据并列对比，支持误差棒与数值标注"""
from chart_base import ChartModule
from plot_utils import _normalize_label


class GroupedBarChart(ChartModule):
    id = "bar_grouped"

    def plot(self, labels, datasets, config, output_path):
        style = self.prepare(config)
        labels = [_normalize_label(str(lbl)) for lbl in labels]
        title = config.get("title", "")
        x_label = config.get("x_label", "")
        y_label = config.get("y_label", "")

        fig, ax = self.new_figure(style)
        n = len(datasets)
        bar_w = 0.75 / max(n, 1)
        colors = self.colors(style, n)
        bk = self.bar_kwargs(style)
        ek = self.error_kwargs(style)

        for i, ds in enumerate(datasets):
            c = colors[i]
            d = list(ds.get("data", []))[:len(labels)]
            while len(d) < len(labels):
                d.append(0)
            lbl = _normalize_label(ds.get("label", ""))
            offset = (i - (n - 1) / 2) * bar_w
            x_pos = range(len(labels))
            yerr = self.dataset_errors(ds, len(labels))
            bars = ax.bar(
                [p + offset for p in x_pos],
                d,
                width=bar_w * 0.88,
                color=c,
                label=lbl or None,
                alpha=0.92,
                zorder=3,
                yerr=yerr,
                error_kw=ek if yerr else None,
                **bk,
            )
            self.annotate_bar_values(ax, bars, style)

        ax.set_xticks(range(len(labels)))
        ax.set_xticklabels(labels)
        self.finalize_axes(ax, style, config=config, title=title, x_label=x_label, y_label=y_label, has_legend=n > 1)
        self.save(fig, output_path, style)
