"""DFT 能带结构 — CSV: k/dist + 多条 band 列；可选高对称点标注"""
from chart_base import ChartModule
from plot_utils import _normalize_label


def _parse_symmetry_points(raw) -> list[tuple[float, str]]:
    """'Γ:0,X:0.5,M:0.75,Γ:1.0' → [(0,'Γ'), ...]"""
    if not raw:
        return []
    if isinstance(raw, list):
        out = []
        for item in raw:
            if isinstance(item, dict) and "x" in item and "label" in item:
                out.append((float(item["x"]), str(item["label"])))
        return out
    text = str(raw).strip()
    if not text:
        return []
    parts = []
    for chunk in text.replace("；", ",").split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        if ":" in chunk:
            lab, xpos = chunk.rsplit(":", 1)
        elif "=" in chunk:
            lab, xpos = chunk.rsplit("=", 1)
        else:
            continue
        try:
            parts.append((float(xpos.strip()), lab.strip()))
        except ValueError:
            continue
    return parts


class DftBandChart(ChartModule):
    id = "dft_band"

    def validate(self, labels, datasets, config):
        if not labels:
            return "数据为空"
        if not datasets:
            return "缺少能带列（至少一条 band）"
        return None

    def plot(self, labels, datasets, config, output_path):
        import numpy as np

        style = self.prepare(config)
        title = config.get("title", "")
        x_label = config.get("x_label", "Wave vector")
        y_label = config.get("y_label", "Energy (eV)")
        fermi = config.get("fermi_energy")
        try:
            fermi_f = float(fermi) if fermi not in (None, "") else None
        except (TypeError, ValueError):
            fermi_f = None

        try:
            x_vals = [float(str(lbl)) for lbl in labels]
        except (ValueError, TypeError):
            x_vals = list(range(len(labels)))

        fig, ax = self.new_figure(style)
        # 能带常用单色细线
        band_color = self.colors(style, 1)[0]
        lw = max(float(style.get("axes_linewidth", 0.8)) * 1.2, 0.8)

        for ds in datasets:
            d = list(ds.get("data", []))[: len(labels)]
            while len(d) < len(labels):
                d.append(np.nan)
            y = np.asarray(d, dtype=float)
            if fermi_f is not None:
                y = y - fermi_f
            ax.plot(x_vals, y, color=band_color, linewidth=lw, alpha=0.9)

        if fermi_f is not None:
            ax.axhline(0.0, color="#B64342", linestyle="--", linewidth=0.9, alpha=0.85, label="E_F")
            y_label = _normalize_label(y_label if "E" in y_label or "eV" in y_label else "E − E_F (eV)")

        sym = _parse_symmetry_points(config.get("symmetry_points"))
        if sym:
            xs = [p[0] for p in sym]
            labs = [_normalize_label(p[1]) for p in sym]
            for xv in xs:
                ax.axvline(xv, color="#CFCECE", linewidth=0.7, zorder=0)
            ax.set_xticks(xs)
            ax.set_xticklabels(labs)
        else:
            # 稀疏刻度
            n = len(x_vals)
            if n > 8:
                step = max(n // 6, 1)
                ticks = list(range(0, n, step))
                if ticks[-1] != n - 1:
                    ticks.append(n - 1)
                ax.set_xticks([x_vals[i] for i in ticks])
                ax.set_xticklabels([_normalize_label(str(labels[i])) for i in ticks])

        self.finalize_axes(
            ax,
            style,
            config=config,
            title=title,
            x_label=x_label if not sym else "",
            y_label=y_label,
            has_legend=fermi_f is not None,
            grid_axis="y",
        )
        self.save(fig, output_path, style)
