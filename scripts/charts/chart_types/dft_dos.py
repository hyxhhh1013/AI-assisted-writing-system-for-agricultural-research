"""DFT DOS / PDOS — CSV: Energy + Total + 可选分波列"""
from chart_base import ChartModule
from plot_utils import _normalize_label


class DftDosChart(ChartModule):
    id = "dft_dos"

    def validate(self, labels, datasets, config):
        if not labels:
            return "数据为空"
        if not datasets:
            return "缺少 DOS 列"
        return None

    def plot(self, labels, datasets, config, output_path):
        import numpy as np

        style = self.prepare(config)
        title = config.get("title", "")
        # 习惯：能量在纵轴，DOS 在横轴（可切换）
        orientation = str(config.get("orientation", "vertical")).lower()
        x_label = config.get("x_label", "DOS (states/eV)")
        y_label = config.get("y_label", "Energy (eV)")
        fermi = config.get("fermi_energy")
        try:
            fermi_f = float(fermi) if fermi not in (None, "") else None
        except (TypeError, ValueError):
            fermi_f = None
        fill = config.get("fill", True) in (True, "true", "1", 1)

        try:
            energy = np.asarray([float(str(lbl)) for lbl in labels], dtype=float)
        except (ValueError, TypeError):
            energy = np.arange(len(labels), dtype=float)

        if fermi_f is not None:
            energy = energy - fermi_f
            y_label = _normalize_label("E − E_F (eV)" if orientation == "vertical" else y_label)

        fig, ax = self.new_figure(style)
        colors = self.colors(style, len(datasets))
        lw = max(float(style.get("axes_linewidth", 0.8)) * 1.4, 1.0)

        for i, ds in enumerate(datasets):
            d = list(ds.get("data", []))[: len(labels)]
            while len(d) < len(labels):
                d.append(0)
            dos = np.asarray(d, dtype=float)
            lbl = _normalize_label(ds.get("label", ""))
            c = colors[i]
            if orientation == "horizontal":
                ax.plot(energy, dos, color=c, linewidth=lw, label=lbl or None)
                if fill:
                    ax.fill_between(energy, dos, alpha=0.15, color=c)
            else:
                ax.plot(dos, energy, color=c, linewidth=lw, label=lbl or None)
                if fill:
                    ax.fill_betweenx(energy, 0, dos, alpha=0.15, color=c)

        if fermi_f is not None:
            if orientation == "horizontal":
                ax.axvline(0.0, color="#B64342", linestyle="--", linewidth=0.9, alpha=0.85)
            else:
                ax.axhline(0.0, color="#B64342", linestyle="--", linewidth=0.9, alpha=0.85)

        if orientation == "horizontal":
            self.finalize_axes(
                ax,
                style,
                config=config,
                title=title,
                x_label=_normalize_label(y_label if "E" in str(y_label) else "Energy (eV)"),
                y_label=_normalize_label(x_label),
                has_legend=len(datasets) > 1,
                grid_axis="both",
            )
        else:
            self.finalize_axes(
                ax,
                style,
                config=config,
                title=title,
                x_label=_normalize_label(x_label),
                y_label=_normalize_label(y_label),
                has_legend=len(datasets) > 1,
                grid_axis="both",
            )
        self.save(fig, output_path, style)
