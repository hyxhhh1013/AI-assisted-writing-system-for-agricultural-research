"""散点图 — 两变量相关关系，支持线性拟合 + R² 标注与多系列标记区分"""
from chart_base import ChartModule
from plot_utils import _normalize_label


class ScatterChart(ChartModule):
    id = "scatter"

    def plot(self, labels, datasets, config, output_path):
        import numpy as np

        style = self.prepare(config)
        labels_display = [_normalize_label(str(lbl)) for lbl in labels]
        title = config.get("title", "")
        x_label = config.get("x_label", "")
        y_label = config.get("y_label", "")

        numeric_x = None
        try:
            numeric_x = [float(str(lbl)) for lbl in labels]
        except (ValueError, TypeError):
            numeric_x = None

        fig, ax = self.new_figure(style)
        colors = self.colors(style, len(datasets))
        markers = self.markers(style, len(datasets))
        ms = max(float(style.get("font_size", 8)) * 8, 36)

        r2_lines: list[tuple[str, float]] = []

        for i, ds in enumerate(datasets):
            c = colors[i]
            d = list(ds.get("data", []))[:len(labels)]
            while len(d) < len(labels):
                d.append(0)
            lbl = _normalize_label(ds.get("label", ""))
            mk = markers[i]

            if numeric_x is not None:
                x_vals = numeric_x
            else:
                x_vals = list(range(len(labels)))

            ax.scatter(
                x_vals, d, c=c, s=ms, marker=mk, alpha=0.85,
                edgecolors="white" if not style.get("bar_edge") else "black",
                linewidth=0.5, label=lbl or None, zorder=3,
            )
            if config.get("show_trendline") in (True, "true", "1", 1) and len(x_vals) >= 2:
                xa = np.asarray(x_vals, dtype=float)
                ya = np.asarray(d[:len(x_vals)], dtype=float)
                try:
                    coeffs = np.polyfit(xa, ya, 1)
                    ax.plot(xa, np.polyval(coeffs, xa), color=c, linestyle="--", linewidth=1.2, alpha=0.7, zorder=2)
                    # R² 计算
                    y_pred = np.polyval(coeffs, xa)
                    ss_res = float(np.sum((ya - y_pred) ** 2))
                    ss_tot = float(np.sum((ya - np.mean(ya)) ** 2))
                    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
                    r2_lines.append((lbl or f"系列{i+1}", r2))
                except (TypeError, ValueError, np.linalg.LinAlgError):
                    pass

        # R² 角注（左上，多系列时逐行列出）
        if r2_lines:
            fs = max(float(style.get("font_size", 8)) - 1, 6)
            lines = [f"$R^2$ = {r2:.3f}" if len(r2_lines) == 1 else f"{name}: $R^2$={r2:.3f}" for name, r2 in r2_lines]
            ax.text(
                0.02, 0.98, "\n".join(lines),
                transform=ax.transAxes, fontsize=fs, va="top", ha="left",
                zorder=5,
            )

        if numeric_x is None:
            ax.set_xticks(range(len(labels)))
            ax.set_xticklabels(labels_display)
        else:
            ax.set_xticklabels(labels_display)

        self.finalize_axes(
            ax, style, config=config, title=title, x_label=x_label, y_label=y_label,
            has_legend=len(datasets) > 1, grid_axis="both",
        )
        self.save(fig, output_path, style)
