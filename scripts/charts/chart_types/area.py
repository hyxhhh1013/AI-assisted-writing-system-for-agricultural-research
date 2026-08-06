"""面积图 — 堆叠 fill_between 趋势（对齐 nature-figure fill-between 模式）"""
from chart_base import ChartModule
from plot_utils import _normalize_label


class AreaChart(ChartModule):
    id = "area"

    def plot(self, labels, datasets, config, output_path):
        style = self.prepare(config)
        labels_display = [_normalize_label(str(lbl)) for lbl in labels]
        title = config.get("title", "")
        x_label = config.get("x_label", "")
        y_label = config.get("y_label", "")
        stacked = config.get("area_stacked") not in (False, "false", "0", 0)

        numeric_x = None
        try:
            numeric_x = [float(str(lbl)) for lbl in labels]
        except (ValueError, TypeError):
            numeric_x = None

        fig, ax = self.new_figure(style)
        colors = self.colors(style, len(datasets))
        markers = self.markers(style, len(datasets))
        alpha = 0.35 if stacked else 0.25
        lw = max(float(style.get("axes_linewidth", 0.8)) * 2, 1.5)
        ms = max(float(style.get("font_size", 8)) * 0.55, 3.5)
        use_markers = style.get("use_markers") in (True, "true", "1", 1) or style.get("preset") in (
            "print_bw", "ieee", "acs", "agr_cn",
        )
        show_shadow = config.get("show_shadow") in (True, "true", "1", 1)

        if numeric_x is not None:
            x_vals = numeric_x
        else:
            x_vals = list(range(len(labels)))

        if stacked:
            bottom = [0.0] * len(labels)
            for i, ds in enumerate(datasets):
                c = colors[i]
                d = list(ds.get("data", []))[:len(labels)]
                while len(d) < len(labels):
                    d.append(0)
                lbl = _normalize_label(ds.get("label", ""))
                top = [bottom[j] + d[j] for j in range(len(labels))]
                ax.fill_between(x_vals, bottom, top, color=c, alpha=alpha, label=lbl or None)
                mk = markers[i] if use_markers else None
                ax.plot(
                    x_vals, top, color=c, linewidth=lw, zorder=3,
                    marker=mk, markersize=ms if mk else 0,
                )
                bottom = top
        else:
            for i, ds in enumerate(datasets):
                c = colors[i]
                d = list(ds.get("data", []))[:len(labels)]
                while len(d) < len(labels):
                    d.append(0)
                lbl = _normalize_label(ds.get("label", ""))
                ax.fill_between(x_vals, 0, d, color=c, alpha=alpha, label=lbl or None)
                mk = markers[i] if use_markers else None
                ax.plot(
                    x_vals, d, color=c, linewidth=lw, zorder=3,
                    marker=mk, markersize=ms if mk else 0,
                )
                if show_shadow:
                    yerr = self.dataset_errors(ds, len(labels))
                    if yerr:
                        lo = [d[j] - yerr[j] for j in range(len(d))]
                        hi = [d[j] + yerr[j] for j in range(len(d))]
                        ax.fill_between(x_vals, lo, hi, color=c, alpha=0.12, zorder=2)

        if numeric_x is None:
            ax.set_xticks(range(len(labels)))
            ax.set_xticklabels(labels_display)
        else:
            ax.set_xticklabels(labels_display)

        self.finalize_axes(
            ax, style, config=config, title=title, x_label=x_label, y_label=y_label,
            has_legend=len(datasets) > 1,
        )
        self.save(fig, output_path, style)
