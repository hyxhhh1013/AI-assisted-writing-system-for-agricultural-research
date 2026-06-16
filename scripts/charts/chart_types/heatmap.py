"""热力图 — 矩阵相关/表达量可视化（对齐 nature-figure make_heatmap）"""
import numpy as np
import matplotlib as mpl
import matplotlib.pyplot as plt

from chart_base import ChartModule
from plot_utils import _normalize_label


class HeatmapChart(ChartModule):
    id = "heatmap"

    def plot(self, labels, datasets, config, output_path):
        style = self.prepare(config)
        title = config.get("title", "")
        x_label = config.get("x_label", "")
        y_label = config.get("y_label", "")
        cmap = str(config.get("cmap") or "YlGnBu")
        annotate = config.get("heatmap_annotate") in (True, "true", "1", 1)

        if not datasets:
            raise ValueError("热力图需要至少一列数值")

        matrix = []
        for row_i in range(len(labels)):
            row = []
            for ds in datasets:
                vals = list(ds.get("data", []))
                row.append(float(vals[row_i]) if row_i < len(vals) else 0.0)
            matrix.append(row)
        matrix_np = np.array(matrix, dtype=float)

        x_labels = [_normalize_label(ds.get("label", f"C{i+1}")) for i, ds in enumerate(datasets)]
        y_labels = [_normalize_label(str(lbl)) for lbl in labels]

        w = float(style.get("fig_width", 3.5))
        h = float(style.get("fig_height", 2.5))
        aspect = max(len(x_labels) / max(len(y_labels), 1), 0.6)
        fig_w = max(w, w * aspect * 0.85)
        fig, ax = plt.subplots(figsize=(fig_w, h))

        im = ax.imshow(matrix_np, cmap=cmap, aspect="auto")
        cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
        fs = max(float(style.get("font_size", 8)) - 1, 6)
        cbar.ax.tick_params(labelsize=fs)
        if y_label:
            cbar.set_label(_normalize_label(y_label), fontsize=fs)

        ax.set_xticks(range(len(x_labels)))
        ax.set_xticklabels(x_labels, rotation=30 if len(x_labels) > 4 else 0, ha="right", fontsize=fs)
        ax.set_yticks(range(len(y_labels)))
        ax.set_yticklabels(y_labels, fontsize=fs)

        if annotate:
            norm = mpl.colors.Normalize(vmin=matrix_np.min(), vmax=matrix_np.max())
            cm_obj = plt.get_cmap(cmap)
            for (i, j), val in np.ndenumerate(matrix_np):
                r, g, b, _ = cm_obj(norm(val))
                lum = 0.299 * r + 0.587 * g + 0.114 * b
                color = "white" if lum < 0.5 else "black"
                ax.text(j, i, f"{val:.2g}", ha="center", va="center", fontsize=fs, color=color)

        if title:
            ax.set_title(_normalize_label(title), fontweight="bold", pad=10, fontsize=float(style.get("font_size", 8)) + 1)
        if x_label:
            ax.set_xlabel(_normalize_label(x_label), labelpad=6, fontsize=fs)

        panel = style.get("panel_label")
        if panel:
            ax.text(
                -0.08, 1.02, str(panel),
                transform=ax.transAxes,
                fontsize=float(style.get("font_size", 8)) + 2,
                fontweight="bold",
            )

        ax.set_frame_on(True)
        for spine in ax.spines.values():
            spine.set_visible(False)

        self.save(fig, output_path, style)
