"""饼图 — 展示各分类占总体的百分比"""
from chart_base import ChartModule, ACADEMIC_COLORS
from plot_utils import _normalize_label


class PieChart(ChartModule):
    id = "pie"

    def plot(self, labels, datasets, config, output_path):
        import matplotlib.pyplot as plt

        labels_display = [_normalize_label(str(lbl)) for lbl in labels]
        title = _normalize_label(config.get("title", ""))

        # 饼图只使用第一个 dataset
        d = list(datasets[0].get("data", []))[:len(labels)]

        fig, ax = plt.subplots(figsize=(7, 7))
        colors = ACADEMIC_COLORS[:len(labels)]

        wedges, texts, autotexts = ax.pie(
            d, labels=labels_display, autopct="%1.1f%%",
            colors=colors, startangle=90,
            textprops={"fontsize": 9},
            pctdistance=0.6,
        )
        for at in autotexts:
            at.set_fontsize(8)
        ax.set_title(title, fontsize=13, fontweight="bold", pad=16)

        plt.tight_layout()
        fig.savefig(output_path, dpi=300, bbox_inches="tight", facecolor="white", edgecolor="none")
        plt.close(fig)
