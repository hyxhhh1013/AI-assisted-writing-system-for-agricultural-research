"""雷达图 — 多指标方法对比（对齐 nature-figure radar 模式）"""
import numpy as np
import matplotlib.pyplot as plt

from chart_base import ChartModule
from plot_utils import _normalize_label


class RadarChart(ChartModule):
    id = "radar"

    def plot(self, labels, datasets, config, output_path):
        style = self.prepare(config)
        title = config.get("title", "")

        n_spokes = len(labels)
        if n_spokes < 3:
            raise ValueError("雷达图至少需要 3 个指标")

        angles = np.linspace(2 * np.pi, 0, n_spokes, endpoint=False)
        angles_closed = np.append(angles, angles[0])

        w = float(style.get("fig_width", 3.5))
        h = float(style.get("fig_height", 2.5))
        size = max(w, h) * 1.1
        fig, ax = plt.subplots(figsize=(size, size), subplot_kw=dict(projection="polar"))

        colors = self.colors(style, len(datasets))
        markers = self.markers(style, len(datasets))
        lw = max(float(style.get("axes_linewidth", 0.8)) * 2, 1.5)
        fs = max(float(style.get("font_size", 8)), 7)

        all_vals = []
        for ds in datasets:
            d = list(ds.get("data", []))[:n_spokes]
            while len(d) < n_spokes:
                d.append(0)
            all_vals.extend(d)
        vmin = float(config.get("radar_min") or min(all_vals) if all_vals else 0)
        vmax = float(config.get("radar_max") or max(all_vals) if all_vals else 1)
        span = vmax - vmin if vmax > vmin else 1.0

        for i, ds in enumerate(datasets):
            c = colors[i]
            d = list(ds.get("data", []))[:n_spokes]
            while len(d) < n_spokes:
                d.append(0)
            norm = [(float(v) - vmin) / span for v in d]
            closed = np.append(norm, norm[0])
            lbl = _normalize_label(ds.get("label", ""))
            ax.plot(angles_closed, closed, color=c, lw=lw, label=lbl or None)
            ax.fill(angles_closed, closed, color=c, alpha=0.08)
            ax.scatter(angles, norm, color=c, s=fs * 2, marker=markers[i], zorder=5)

        ax.set_ylim(0, 1.05)
        ax.set_theta_zero_location("N")
        ax.set_theta_direction(-1)
        for spine in ax.spines.values():
            spine.set_visible(False)
        ax.grid(True, alpha=0.25, linewidth=0.5)
        ax.set_yticks([])
        ax.set_xticks(angles)
        ax.set_xticklabels([_normalize_label(str(l)) for l in labels], fontsize=fs)

        if title:
            ax.set_title(_normalize_label(title), fontweight="bold", pad=16, fontsize=fs + 1)
        if len(datasets) > 1:
            from plot_style import apply_legend
            apply_legend(ax, style, True)

        # 应用 panel_label、y_sci_notation、x_tick_rotation 等高级选项
        if config:
            self.apply_axis_extras(ax, config, style)
        self.save(fig, output_path, style)
