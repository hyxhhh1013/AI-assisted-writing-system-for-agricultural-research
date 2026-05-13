"""百分比堆积柱状图 — 各部分相对比例，自动归一化到 100%"""
from chart_base import ChartModule, ACADEMIC_COLORS
from plot_utils import _normalize_label


class PctStackedBarChart(ChartModule):
    id = "bar_pct_stacked"

    def plot(self, labels, datasets, config, output_path):
        import matplotlib.pyplot as plt

        labels = [_normalize_label(str(lbl)) for lbl in labels]
        title = _normalize_label(config.get("title", ""))
        x_label = _normalize_label(config.get("x_label", ""))
        y_label = _normalize_label(config.get("y_label", "相对比例 (%)"))

        # 归一化到 100%
        totals = [0.0] * len(labels)
        for ds in datasets:
            for j in range(min(len(ds.get("data", [])), len(labels))):
                totals[j] += float(ds["data"][j] or 0)
        for ds in datasets:
            d_raw = ds.get("data", [])
            ds["data"] = [(float(v or 0) / totals[j] * 100) if totals[j] > 0 else 0
                          for j, v in enumerate(d_raw[:len(labels)])]

        fig, ax = plt.subplots(figsize=(8, 4.8))
        bar_w = 0.65
        bottom_vals = [0.0] * len(labels)

        for i, ds in enumerate(datasets):
            c = ACADEMIC_COLORS[i % len(ACADEMIC_COLORS)]
            d = list(ds.get("data", []))[:len(labels)]
            while len(d) < len(labels):
                d.append(0)
            lbl = _normalize_label(ds.get("label", ""))
            x_pos = range(len(labels))
            btm = bottom_vals if i > 0 else None
            ax.bar(x_pos, d, width=bar_w, bottom=btm,
                   color=c, edgecolor="white", linewidth=0.5,
                   label=lbl or None, alpha=0.92, zorder=3)
            bottom_vals = [bottom_vals[j] + d[j] for j in range(len(labels))]

        ax.set_xticks(range(len(labels)))
        ax.set_xticklabels(labels, fontsize=9)
        ax.set_ylim(0, 100)
        if not config.get("y_label"):
            ax.set_ylabel(y_label, fontsize=12, labelpad=8)
        else:
            ax.set_ylabel(_normalize_label(config.get("y_label", "")), fontsize=12, labelpad=8)
        if x_label:
            ax.set_xlabel(x_label, fontsize=12, labelpad=8)
        ax.set_title(title, fontsize=13, fontweight="bold", pad=12)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.spines["left"].set_color("#cccccc")
        ax.spines["bottom"].set_color("#cccccc")
        ax.tick_params(colors="#666666", labelsize=9)
        ax.grid(axis="y", alpha=0.25, color="#aaaaaa", linewidth=0.5)
        ax.set_axisbelow(True)
        if len(datasets) > 1:
            ax.legend(fontsize=9, frameon=True, edgecolor="#ddd", loc="best")

        plt.tight_layout()
        fig.savefig(output_path, dpi=300, bbox_inches="tight", facecolor="white", edgecolor="none")
        plt.close(fig)
