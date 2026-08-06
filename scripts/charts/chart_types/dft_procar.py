"""DFT PROCAR 投影能带（fat bands）— 细线 + 按 s/p/d 权重着色散点"""
from chart_base import ChartModule
from plot_utils import _normalize_label


def _parse_symmetry_points(raw) -> list[tuple[float, str]]:
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


_ORB_COLORS = {
    "s": "#C0392B",
    "p": "#2980B9",
    "d": "#27AE60",
    "tot": "#2C3E50",
}


class DftProcarChart(ChartModule):
    id = "dft_procar"

    def validate(self, labels, datasets, config):
        if not labels:
            return "数据为空"
        if not datasets:
            return "缺少能带列"
        return None

    def plot(self, labels, datasets, config, output_path):
        import numpy as np
        from matplotlib.lines import Line2D

        style = self.prepare(config)
        title = config.get("title", "")
        x_label = config.get("x_label", "Wave vector")
        y_label = config.get("y_label", "Energy (eV)")
        fermi = config.get("fermi_energy")
        try:
            fermi_f = float(fermi) if fermi not in (None, "") else None
        except (TypeError, ValueError):
            fermi_f = None

        raw_orbs = str(config.get("project_orbitals") or "s,p,d")
        orbitals = [
            o.strip().lower()
            for o in raw_orbs.replace("；", ",").split(",")
            if o.strip().lower() in _ORB_COLORS
        ]
        if not orbitals:
            orbitals = ["s", "p", "d"]

        try:
            scale = float(config.get("fat_scale") or 80)
        except (TypeError, ValueError):
            scale = 80.0
        scale = max(10.0, min(scale, 400.0))

        try:
            x_vals = [float(str(lbl)) for lbl in labels]
        except (ValueError, TypeError):
            x_vals = list(range(len(labels)))

        fig, ax = self.new_figure(style)
        band_color = "#B0B0B0"
        lw = max(float(style.get("axes_linewidth", 0.8)) * 0.9, 0.6)

        # 背景能带细线
        for ds in datasets:
            d = list(ds.get("data", []))[: len(labels)]
            while len(d) < len(labels):
                d.append(np.nan)
            y = np.asarray(d, dtype=float)
            # 已在 parse 阶段按需减过 E-fermi；此处仅当仍传绝对费米时再减
            if fermi_f is not None and config.get("energies_shifted") not in (True, "true", "1", 1):
                y = y - fermi_f
            ax.plot(x_vals, y, color=band_color, linewidth=lw, alpha=0.55, zorder=1)

        # fat band 散点
        for orb in orbitals:
            xs_all: list[float] = []
            ys_all: list[float] = []
            ss_all: list[float] = []
            for ds in datasets:
                d = list(ds.get("data", []))[: len(labels)]
                while len(d) < len(labels):
                    d.append(np.nan)
                y = np.asarray(d, dtype=float)
                if fermi_f is not None and config.get("energies_shifted") not in (True, "true", "1", 1):
                    y = y - fermi_f
                wdict = ds.get("weights") or {}
                w = list(wdict.get(orb) or [])
                while len(w) < len(labels):
                    w.append(0.0)
                w = np.asarray(w[: len(labels)], dtype=float)
                mask = np.isfinite(y) & (w > 1e-8)
                if not np.any(mask):
                    continue
                xs_all.extend(np.asarray(x_vals, dtype=float)[mask].tolist())
                ys_all.extend(y[mask].tolist())
                ss_all.extend((w[mask] * scale).tolist())
            if xs_all:
                ax.scatter(
                    xs_all,
                    ys_all,
                    s=ss_all,
                    c=_ORB_COLORS[orb],
                    alpha=0.55,
                    linewidths=0,
                    zorder=2,
                    label=orb,
                )

        ef_line = fermi_f is not None or config.get("energies_shifted") in (True, "true", "1", 1)
        if ef_line:
            ax.axhline(0.0, color="#B64342", linestyle="--", linewidth=0.9, alpha=0.85)
            y_label = _normalize_label(
                y_label if ("E" in y_label or "eV" in y_label) else "E − E_F (eV)"
            )

        sym = _parse_symmetry_points(config.get("symmetry_points"))
        if sym:
            xs = [p[0] for p in sym]
            labs = [_normalize_label(p[1]) for p in sym]
            for xv in xs:
                ax.axvline(xv, color="#CFCECE", linewidth=0.7, zorder=0)
            ax.set_xticks(xs)
            ax.set_xticklabels(labs)
        else:
            n = len(x_vals)
            if n > 8:
                step = max(n // 6, 1)
                ticks = list(range(0, n, step))
                if ticks[-1] != n - 1:
                    ticks.append(n - 1)
                ax.set_xticks([x_vals[i] for i in ticks])
                ax.set_xticklabels([_normalize_label(str(labels[i])) for i in ticks])

        legend_handles = [
            Line2D(
                [0],
                [0],
                marker="o",
                color="w",
                markerfacecolor=_ORB_COLORS[o],
                markersize=6,
                label=o,
            )
            for o in orbitals
        ]
        if legend_handles:
            ax.legend(handles=legend_handles, frameon=False, loc="best", fontsize=7)

        self.finalize_axes(
            ax,
            style,
            config=config,
            title=title,
            x_label=x_label if not sym else "",
            y_label=y_label,
            has_legend=False,
            grid_axis="y",
        )
        self.save(fig, output_path, style)
