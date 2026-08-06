"""堆积柱状图 — 各部分绝对值的堆叠构成，支持顶部总误差棒与显著性标注"""
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
        ek = self.error_kwargs(style)

        stack_top = [0.0] * len(labels)
        last_idx = len(datasets) - 1
        for i, ds in enumerate(datasets):
            c = colors[i]
            d = list(ds.get("data", []))[:len(labels)]
            while len(d) < len(labels):
                d.append(0)
            lbl = _normalize_label(ds.get("label", ""))
            x_pos = range(len(labels))
            btm = bottom_vals if i > 0 else None
            # 误差棒只在最顶段渲染（表示整个堆叠的总误差）
            yerr = None
            if i == last_idx:
                yerr = self.dataset_errors(ds, len(labels))
            bars = ax.bar(
                x_pos, d, width=bar_w, bottom=btm,
                color=c, label=lbl or None, alpha=0.92, zorder=3,
                yerr=yerr, error_kw=ek if yerr else None,
                **bk,
            )
            if i == last_idx:
                self.annotate_bar_values(ax, bars, style)
                for ci, val in enumerate(d):
                    top = bottom_vals[ci] + float(val)
                    if yerr is not None and ci < len(yerr):
                        try:
                            top += float(yerr[ci])
                        except (TypeError, ValueError):
                            pass
                    stack_top[ci] = top
            for j in range(len(labels)):
                bottom_vals[j] += d[j]

        ax.set_xticks(range(len(labels)))
        ax.set_xticklabels(labels)
        self.finalize_axes(
            ax, style, config=config, title=title, x_label=x_label, y_label=y_label,
            has_legend=len(datasets) > 1,
        )
        self.draw_category_significance(ax, {i: stack_top[i] for i in range(len(stack_top))}, config, style)
        self.save(fig, output_path, style)
