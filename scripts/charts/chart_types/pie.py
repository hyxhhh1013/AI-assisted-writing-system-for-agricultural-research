"""饼图 — 各分类占比，支持环形(donut)与图例模式（多扇区标签更清晰）"""
from chart_base import ChartModule
from plot_utils import _normalize_label


class PieChart(ChartModule):
    id = "pie"

    def plot(self, labels, datasets, config, output_path):
        style = self.prepare(config)
        labels_display = [_normalize_label(str(lbl)) for lbl in labels]
        title = config.get("title", "")

        d = list(datasets[0].get("data", []))[:len(labels)]
        colors = self.colors(style, len(labels))
        fs = max(float(style.get("font_size", 8)), 7)

        w = float(style.get("fig_width", 3.5))
        h = float(style.get("fig_height", 2.5))
        size = max(w, h)
        fig, ax = self.new_figure({**style, "fig_width": size, "fig_height": size})

        donut = config.get("donut") in (True, "true", "1", 1)
        show_legend = config.get("show_legend") in (True, "true", "1", 1)
        # 多扇区(>5)或显式要求时：标签进图例，饼上只留百分比
        use_legend = show_legend or len(labels) > 5

        _wedges, _texts, autotexts = ax.pie(
            d,
            labels=None if use_legend else labels_display,
            autopct="%1.1f%%",
            colors=colors,
            startangle=90,
            textprops={"fontsize": fs},
            pctdistance=0.6,
            wedgeprops={"width": 0.5} if donut else None,
        )
        for at in autotexts:
            at.set_fontsize(max(fs - 1, 6))

        if use_legend:
            # 图例带百分比，扇区多时更可读
            total = sum(float(v or 0) for v in d) or 1.0
            legend_labels = [
                f"{_normalize_label(str(l))} ({float(v or 0)/total*100:.1f}%)"
                for l, v in zip(labels_display, d)
            ]
            ax.legend(
                _wedges, legend_labels,
                loc="center left", bbox_to_anchor=(1, 0.5),
                frameon=False, fontsize=fs,
            )

        self.finalize_axes(
            ax, style, config=config, title=title,
            has_legend=False,
        )
        self.save(fig, output_path, style)
