"""折线图 — 展示数值随变量变化的连续趋势，支持误差阴影 / 双 Y / 线性拟合"""
from chart_base import ChartModule
from plot_utils import _normalize_label


class LineChart(ChartModule):
    id = "line"

    def plot(self, labels, datasets, config, output_path):
        import numpy as np

        style = self.prepare(config)
        labels_display = [_normalize_label(str(lbl)) for lbl in labels]
        title = config.get("title", "")
        x_label = config.get("x_label", "")
        y_label = config.get("y_label", "")
        y2_label = config.get("y2_label", "")
        dual_y = config.get("dual_y") in (True, "true", "1", 1) and len(datasets) >= 2
        show_fit = config.get("show_trendline") in (True, "true", "1", 1)

        numeric_x = None
        try:
            numeric_x = [float(str(lbl)) for lbl in labels]
        except (ValueError, TypeError):
            numeric_x = None

        fig, ax = self.new_figure(style)
        ax2 = ax.twinx() if dual_y else None
        colors = self.colors(style, len(datasets))
        markers = self.markers(style, len(datasets))
        lw = max(float(style.get("axes_linewidth", 0.8)) * 2, 1.5)
        ms = max(float(style.get("font_size", 8)) * 0.6, 4)
        use_markers = style.get("use_markers") in (True, "true", "1", 1) or style.get("preset") in (
            "print_bw", "ieee", "acs", "agr_cn",
        )

        for i, ds in enumerate(datasets):
            c = colors[i]
            d = list(ds.get("data", []))[:len(labels)]
            while len(d) < len(labels):
                d.append(0)
            lbl = _normalize_label(ds.get("label", ""))
            yerr = self.dataset_errors(ds, len(labels))

            if numeric_x is not None:
                x_vals = numeric_x
            else:
                x_vals = list(range(len(labels)))

            target = ax2 if (dual_y and i == len(datasets) - 1 and ax2 is not None) else ax
            mk = markers[i] if use_markers else None
            target.plot(
                x_vals, d, color=c, marker=mk, linewidth=lw,
                markersize=ms if mk else 0,
                label=lbl or None, zorder=3,
            )
            if yerr:
                target.errorbar(
                    x_vals, d, yerr=yerr, fmt="none", ecolor=c,
                    elinewidth=lw * 0.6, capsize=ms * 0.5, alpha=0.85,
                )
            if config.get("show_shadow") in (True, "true", "1", 1) and yerr:
                lo = [d[j] - yerr[j] for j in range(len(d))]
                hi = [d[j] + yerr[j] for j in range(len(d))]
                target.fill_between(x_vals, lo, hi, color=c, alpha=0.12, zorder=2)

            if show_fit and len(x_vals) >= 2:
                try:
                    coeffs = np.polyfit(np.asarray(x_vals, dtype=float), np.asarray(d[: len(x_vals)], dtype=float), 1)
                    trend_x = np.asarray(x_vals, dtype=float)
                    target.plot(
                        trend_x, np.polyval(coeffs, trend_x),
                        color=c, linestyle="--", linewidth=1.1, alpha=0.75, zorder=2,
                    )
                except (TypeError, ValueError, np.linalg.LinAlgError):
                    pass

        if numeric_x is None:
            ax.set_xticks(range(len(labels)))
            ax.set_xticklabels(labels_display)
        else:
            ax.set_xticklabels(labels_display)

        self.finalize_axes(
            ax, style, config=config, title=title, x_label=x_label, y_label=y_label,
            has_legend=len(datasets) > 1,
        )
        if ax2 is not None:
            if y2_label:
                ax2.set_ylabel(_normalize_label(y2_label), labelpad=6)
            ax2.spines["top"].set_visible(False)
            # 合并双轴图例
            h1, l1 = ax.get_legend_handles_labels()
            h2, l2 = ax2.get_legend_handles_labels()
            if h1 or h2:
                ax.legend(h1 + h2, l1 + l2, frameon=bool(style.get("legend_frame")), fontsize=float(style.get("font_size", 8)))
        self.save(fig, output_path, style)
