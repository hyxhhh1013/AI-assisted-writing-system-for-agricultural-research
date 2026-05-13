"""散点图 — 展示两个变量之间的相关关系"""
from chart_base import ChartModule, ACADEMIC_COLORS
from plot_utils import _normalize_label


class ScatterChart(ChartModule):
    id = "scatter"

    def plot(self, labels, datasets, config, output_path):
        import matplotlib.pyplot as plt

        labels_display = [_normalize_label(str(lbl)) for lbl in labels]
        title = _normalize_label(config.get("title", ""))
        x_label = _normalize_label(config.get("x_label", ""))
        y_label = _normalize_label(config.get("y_label", ""))

        numeric_x = None
        try:
            numeric_x = [float(str(lbl)) for lbl in labels]
        except (ValueError, TypeError):
            numeric_x = None

        fig, ax = plt.subplots(figsize=(8, 4.8))

        for i, ds in enumerate(datasets):
            c = ACADEMIC_COLORS[i % len(ACADEMIC_COLORS)]
            d = list(ds.get("data", []))[:len(labels)]
            while len(d) < len(labels):
                d.append(0)
            lbl = _normalize_label(ds.get("label", ""))

            if numeric_x is not None:
                ax.scatter(numeric_x, d, c=c, s=70, alpha=0.85, edgecolors="white",
                           linewidth=0.5, label=lbl or None, zorder=3)
            else:
                x_pos = range(len(labels))
                ax.scatter(x_pos, d, c=c, s=70, alpha=0.85, edgecolors="white",
                           linewidth=0.5, label=lbl or None, zorder=3)

        if numeric_x is None:
            ax.set_xticks(range(len(labels)))
            ax.set_xticklabels(labels_display, fontsize=9)
        else:
            ax.set_xticklabels(labels_display, fontsize=9)

        if x_label:
            ax.set_xlabel(x_label, fontsize=12, labelpad=8)
        if y_label:
            ax.set_ylabel(y_label, fontsize=12, labelpad=8)
        ax.set_title(title, fontsize=13, fontweight="bold", pad=12)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.spines["left"].set_color("#cccccc")
        ax.spines["bottom"].set_color("#cccccc")
        ax.tick_params(colors="#666666", labelsize=9)
        ax.grid(alpha=0.25, color="#aaaaaa", linewidth=0.5)
        ax.set_axisbelow(True)
        if len(datasets) > 1:
            ax.legend(fontsize=9, frameon=True, edgecolor="#ddd", loc="best")

        plt.tight_layout()
        fig.savefig(output_path, dpi=300, bbox_inches="tight", facecolor="white", edgecolor="none")
        plt.close(fig)
