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
        diverging = config.get("diverging") in (True, "true", "1", 1)
        cmap = str(config.get("cmap") or ("RdBu_r" if diverging else "YlGnBu"))
        annotate = config.get("heatmap_annotate") in (True, "true", "1", 1)
        annotate_format = str(config.get("annotate_format") or ("2g" if not diverging else "2f"))

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

        norm = None
        if diverging:
            # 发散色：以 0 为中心，vmin/vmax 取绝对值最大，保证 0 是中性色
            vmax = float(np.max(np.abs(matrix_np))) or 1.0
            norm = mpl.colors.Normalize(vmin=-vmax, vmax=vmax)
        im = ax.imshow(matrix_np, cmap=cmap, aspect="auto", norm=norm)
        cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
        fs = max(float(style.get("font_size", 8)) - 1, 6)
        cbar.ax.tick_params(labelsize=fs)
        if y_label:
            cbar.set_label(_normalize_label(y_label), fontsize=fs)

        ax.set_xticks(range(len(x_labels)))
        ax.set_xticklabels(x_labels, fontsize=fs)
        ax.set_yticks(range(len(y_labels)))
        ax.set_yticklabels(y_labels, fontsize=fs)

        if annotate:
            ann_norm = norm or mpl.colors.Normalize(
                vmin=matrix_np.min(), vmax=matrix_np.max(),
            )
            cm_obj = plt.get_cmap(cmap)
            for (i, j), val in np.ndenumerate(matrix_np):
                r, g, b, _ = cm_obj(ann_norm(val))
                lum = 0.299 * r + 0.587 * g + 0.114 * b
                color = "white" if lum < 0.5 else "black"
                ax.text(j, i, f"{val:.{annotate_format}}", ha="center", va="center", fontsize=fs, color=color)

        # 单元格间白色网格线（期刊热力图惯例）
        ax.set_xticks(np.arange(-0.5, len(x_labels), 1), minor=True)
        ax.set_yticks(np.arange(-0.5, len(y_labels), 1), minor=True)
        ax.grid(which="minor", color="white", linewidth=1.2)
        ax.tick_params(which="minor", length=0)

        ax.set_frame_on(True)
        for spine in ax.spines.values():
            spine.set_visible(False)

        # 统一走 finalize_axes 处理标题/标签/panel_label/图例/轴选项
        self.finalize_axes(
            ax, style, config=config, title=title, x_label=x_label,
            y_label=y_label, has_legend=False,
        )
        self.save(fig, output_path, style)
