"""百分比堆积柱状图 — 各部分相对比例，自动归一化到 100%；段内百分比标注 + 顶部显著性"""
from chart_base import ChartModule
from plot_utils import _normalize_label


class PctStackedBarChart(ChartModule):
    id = "bar_pct_stacked"

    def plot(self, labels, datasets, config, output_path):
        style = self.prepare(config)
        labels = [_normalize_label(str(lbl)) for lbl in labels]
        title = config.get("title", "")
        x_label = config.get("x_label", "")
        y_label = config.get("y_label", "") or "相对比例 (%)"

        totals = [0.0] * len(labels)
        for ds in datasets:
            d_raw = list(ds.get("data", []))[:len(labels)]
            for j, v in enumerate(d_raw):
                totals[j] += float(v or 0)

        fig, ax = self.new_figure(style)
        bar_w = 0.65
        bottom_vals = [0.0] * len(labels)
        colors = self.colors(style, len(datasets))
        bk = self.bar_kwargs(style)

        show_vals = style.get("show_values") in (True, "1", "true", "yes", "on")
        fs = max(float(style.get("font_size", 8)) - 1, 6)

        for i, ds in enumerate(datasets):
            c = colors[i]
            d_raw = list(ds.get("data", []))[:len(labels)]
            d = [
                (float(v or 0) / totals[j] * 100) if totals[j] > 0 else 0
                for j, v in enumerate(d_raw)
            ]
            while len(d) < len(labels):
                d.append(0)
            lbl = _normalize_label(ds.get("label", ""))
            x_pos = range(len(labels))
            btm = bottom_vals if i > 0 else None
            ax.bar(
                x_pos, d, width=bar_w, bottom=btm,
                color=c, label=lbl or None, alpha=0.92, zorder=3, **bk,
            )
            if show_vals:
                # 段内百分比标注：段足够高才写，防止细段文字堆叠
                for ci, val in enumerate(d):
                    if val < 3.5:
                        continue
                    seg_mid = bottom_vals[ci] + val / 2
                    ax.text(
                        ci, seg_mid, f"{val:.0f}%",
                        ha="center", va="center", fontsize=fs, zorder=4,
                    )
            bottom_vals = [bottom_vals[j] + d[j] for j in range(len(labels))]

        ax.set_xticks(range(len(labels)))
        ax.set_xticklabels(labels)
        ax.set_ylim(0, 100)
        self.finalize_axes(
            ax, style, config=config, title=title, x_label=x_label, y_label=y_label,
            has_legend=len(datasets) > 1,
        )
        # 顶部恒为 100%，显著性标在顶部
        self.draw_category_significance(
            ax, {i: 100.0 for i in range(len(labels))}, config, style,
        )
        self.save(fig, output_path, style)
