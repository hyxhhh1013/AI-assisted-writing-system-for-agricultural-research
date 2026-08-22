"""分组柱状图 — 多组数据并列对比，支持误差棒、数值标注与显著性标记（星号/括号）"""
from chart_base import ChartModule
from plot_utils import _normalize_label


class GroupedBarChart(ChartModule):
    id = "bar_grouped"

    def plot(self, labels, datasets, config, output_path):
        style = self.prepare(config)
        labels = [_normalize_label(str(lbl)) for lbl in labels]
        title = config.get("title", "")
        x_label = config.get("x_label", "")
        y_label = config.get("y_label", "")

        fig, ax = self.new_figure(style)
        n = len(datasets)
        bar_w = 0.75 / max(n, 1)
        colors = self.colors(style, n)
        bk = self.bar_kwargs(style)
        ek = self.error_kwargs(style)

        bars_by_series: list[tuple[str, list]] = []
        # (ci, si) -> 柱顶 y（含误差棒上沿）
        tops: dict[tuple[int, int], float] = {}
        for i, ds in enumerate(datasets):
            c = colors[i]
            d = list(ds.get("data", []))[: len(labels)]
            while len(d) < len(labels):
                d.append(0)
            lbl = _normalize_label(ds.get("label", ""))
            offset = (i - (n - 1) / 2) * bar_w
            x_pos = range(len(labels))
            yerr = self.dataset_errors(ds, len(labels))
            bars = ax.bar(
                [p + offset for p in x_pos],
                d,
                width=bar_w * 0.88,
                color=c,
                label=lbl or None,
                alpha=0.92,
                zorder=3,
                yerr=yerr,
                error_kw=ek if yerr else None,
                **bk,
            )
            self.annotate_bar_values(ax, bars, style)
            for ci, (bar, val) in enumerate(zip(bars, d)):
                top = float(val)
                if yerr is not None and ci < len(yerr):
                    try:
                        top += float(yerr[ci])
                    except (TypeError, ValueError):
                        pass
                tops[(ci, i)] = top
            bars_by_series.append((lbl, bars))

        ax.set_xticks(range(len(labels)))
        ax.set_xticklabels(labels)
        self.finalize_axes(
            ax, style, config=config, title=title, x_label=x_label, y_label=y_label,
            has_legend=n > 1,
        )
        self._draw_significance(ax, bars_by_series, tops, config, style)
        self.save(fig, output_path, style)

    def _draw_significance(self, ax, bars_by_series, tops, config, style):
        """显著性标注：单柱/单类星号 + 跨类括号（config.significance 数组或 JSON 字符串）。

        条目形状：
          {"category": 0, "series": 0, "value": "**", "label": "p<0.01"}  # 指定柱子顶部
          {"category": 0, "value": "*"}                                   # 该类最高柱
          {"fromCategory": 0, "toCategory": 1, "value": "**"}             # 跨类括号
        tops: (ci, si) -> 柱顶 y（含误差棒上沿）
        """
        sig = self.read_significance(config)
        if not sig:
            return

        fs = max(float(style.get("font_size", 8)) - 1, 6)
        gap = fs * 0.18

        cat_max: dict[int, float] = {}
        bar_at: dict[tuple[int, int], object] = {}
        for si, (_lbl, bars) in enumerate(bars_by_series):
            for ci, bar in enumerate(bars):
                bar_at[(ci, si)] = bar
                cat_max[ci] = max(cat_max.get(ci, 0.0), tops.get((ci, si), 0.0))

        # 已用 y 占位（按 x 中心区间）避免标注重叠
        used: list[tuple[float, float, float]] = []

        def next_y(x_center, base_y):
            y = base_y
            for (ux0, ux1, uy) in used:
                if ux0 <= x_center <= ux1:
                    y = max(y, uy + gap * 3)
            return y

        for item in sig:
            if not isinstance(item, dict):
                continue
            value = str(item.get("value", "")).strip()
            if not value:
                continue
            label = item.get("label")
            text = value + (f" {label}" if label else "")

            fc = item.get("fromCategory")
            tc = item.get("toCategory")
            if fc is not None and tc is not None:
                try:
                    fc_i, tc_i = int(fc), int(tc)
                except (TypeError, ValueError):
                    continue
                if tc_i <= fc_i or fc_i not in cat_max:
                    continue
                x0 = fc_i - 0.35
                x1 = tc_i + 0.35
                base_y = max(
                    (cat_max.get(i, 0.0) for i in range(fc_i, tc_i + 1)), default=0.0,
                )
                y = next_y((x0 + x1) / 2, base_y + gap)
                tick = gap * 0.6
                ax.plot(
                    [x0, x0, x1, x1], [y, y + tick, y + tick, y],
                    color="black", lw=0.8, clip_on=False, zorder=4,
                )
                ax.text(
                    (x0 + x1) / 2, y + tick, text,
                    ha="center", va="bottom", fontsize=fs, clip_on=False, zorder=4,
                )
                used.append((x0, x1, y + tick))
                continue

            ci = item.get("category")
            try:
                ci_i = int(ci)
            except (TypeError, ValueError):
                continue
            if ci_i not in cat_max:
                continue
            if item.get("series") is None:
                x_center = float(ci_i)
                base_y = cat_max[ci_i]
            else:
                try:
                    si_i = int(item["series"])
                except (TypeError, ValueError):
                    continue
                key = (ci_i, si_i)
                if key not in bar_at:
                    continue
                bar = bar_at[key]
                x_center = bar.get_x() + bar.get_width() / 2
                base_y = tops.get(key, 0.0)
            y = next_y(x_center, base_y + gap)
            ax.text(
                x_center, y, text,
                ha="center", va="bottom", fontsize=fs, clip_on=False, zorder=4,
            )
            used.append((x_center, x_center, y + gap * 0.6))
