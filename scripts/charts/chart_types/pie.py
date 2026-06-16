"""饼图 — 展示各分类占总体的百分比"""
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

        _wedges, _texts, autotexts = ax.pie(
            d, labels=labels_display, autopct="%1.1f%%",
            colors=colors, startangle=90,
            textprops={"fontsize": fs},
            pctdistance=0.6,
        )
        for at in autotexts:
            at.set_fontsize(max(fs - 1, 6))
        if title:
            ax.set_title(_normalize_label(title), fontweight="bold", pad=12)

        self.save(fig, output_path, style)
