"""森林图 — 效应量 + 置信区间（对齐 nature-figure make_forest_plot）"""
import numpy as np

from chart_base import ChartModule
from plot_style import style_axes
from plot_utils import _normalize_label


class ForestChart(ChartModule):
    id = "forest"

    def validate(self, labels, datasets, config) -> str | None:
        forest = config.get("forest")
        if forest and isinstance(forest, dict):
            est = forest.get("estimates") or []
            lo = forest.get("ci_low") or []
            hi = forest.get("ci_high") or []
            if len(est) >= 1 and len(lo) == len(est) and len(hi) == len(est):
                return None
        if len(datasets) >= 3:
            return None
        return "森林图需要四列：研究, 估计值, CI下限, CI上限"

    def plot(self, labels, datasets, config, output_path):
        style = self.prepare(config)
        title = config.get("title", "")
        x_label = config.get("x_label", "效应量")
        ref = float(config.get("forest_ref") or 0.0)

        forest = config.get("forest") if isinstance(config.get("forest"), dict) else None
        if forest:
            estimates = [float(v) for v in forest.get("estimates", [])]
            ci_low = [float(v) for v in forest.get("ci_low", [])]
            ci_high = [float(v) for v in forest.get("ci_high", [])]
            study_labels = [_normalize_label(str(l)) for l in (forest.get("labels") or labels)]
        else:
            study_labels = [_normalize_label(str(lbl)) for lbl in labels]
            estimates = [float(datasets[0].get("data", [])[i]) for i in range(len(labels))]
            ci_low = [float(datasets[1].get("data", [])[i]) for i in range(len(labels))]
            ci_high = [float(datasets[2].get("data", [])[i]) for i in range(len(labels))]

        n = min(len(study_labels), len(estimates), len(ci_low), len(ci_high))
        study_labels = study_labels[:n]
        estimates = estimates[:n]
        ci_low = ci_low[:n]
        ci_high = ci_high[:n]

        fig, ax = self.new_figure(style)
        colors = self.colors(style, n)
        y = np.arange(n)[::-1]
        ms = max(float(style.get("font_size", 8)) * 1.2, 6)
        lw = max(float(style.get("axes_linewidth", 0.8)), 1.0)

        for yi, est, lo, hi, color in zip(y, estimates, ci_low, ci_high, colors):
            ax.plot([lo, hi], [yi, yi], color=color, lw=lw, zorder=3)
            ax.plot(est, yi, marker="o", ms=ms, color=color, zorder=4)

        ax.axvline(ref, color="#767676", linestyle="--", linewidth=1.0, alpha=0.85, zorder=2)
        ax.set_yticks(y)
        ax.set_yticklabels(study_labels)
        ax.set_xlabel(_normalize_label(x_label), labelpad=6)
        if title:
            ax.set_title(_normalize_label(title), fontweight="bold", pad=10)

        style_axes(ax, style, grid_axis="x")
        if config:
            self.apply_axis_extras(ax, config, style)
        if len(datasets) > 0:
            from plot_style import apply_legend
            apply_legend(ax, style, False)  # 森林图通常不需要图例，但让样式选项生效

        self.save(fig, output_path, style)
