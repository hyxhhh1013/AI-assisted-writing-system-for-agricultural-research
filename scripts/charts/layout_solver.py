"""
FIG-QA-004：确定性布局求解。
在 save 前调整刻度旋转 / 图例位置 / ylim / 边距；不改刊宽。
失败只记 warn，不阻断出图。
"""
from __future__ import annotations

from typing import Any

from plot_style import apply_legend, save_figure


def _overlap(a, b, pad: float = 1.0) -> bool:
    return not (a.x1 + pad < b.x0 or b.x1 + pad < a.x0 or a.y1 + pad < b.y0 or b.y1 + pad < a.y0)


def _renderer(fig):
    fig.canvas.draw()
    return fig.canvas.get_renderer()


def _xtick_overlap(ax, renderer) -> bool:
    labels = [t for t in ax.get_xticklabels() if t.get_visible() and str(t.get_text()).strip()]
    boxes = []
    for t in labels:
        try:
            boxes.append(t.get_window_extent(renderer=renderer))
        except Exception:
            continue
    for i in range(len(boxes) - 1):
        if _overlap(boxes[i], boxes[i + 1], pad=0.5):
            return True
    return False


def _legend_covers_data(ax, renderer) -> bool:
    leg = ax.get_legend()
    if leg is None:
        return False
    try:
        lb = leg.get_window_extent(renderer=renderer)
    except Exception:
        return False
    artists = list(ax.patches) + list(ax.collections) + list(ax.lines)
    for art in artists:
        try:
            bb = art.get_window_extent(renderer=renderer)
        except Exception:
            continue
        if bb.width <= 0 or bb.height <= 0:
            continue
        if _overlap(lb, bb, pad=2.0):
            return True
    return False


def _clip_sides(fig, renderer) -> set[str]:
    """返回超出画布的边：top / bottom / x。"""
    fb = fig.bbox
    sides: set[str] = set()
    texts = list(fig.texts)
    for ax in fig.axes:
        texts.extend(ax.texts)
        texts.extend(ax.get_xticklabels())
        texts.extend(ax.get_yticklabels())
        if ax.xaxis.label:
            texts.append(ax.xaxis.label)
        if ax.yaxis.label:
            texts.append(ax.yaxis.label)
        if ax.title:
            texts.append(ax.title)
    for t in texts:
        if t is None or not t.get_visible():
            continue
        if not str(t.get_text()).strip():
            continue
        try:
            tb = t.get_window_extent(renderer=renderer)
        except Exception:
            continue
        if tb.y1 > fb.y1 + 3:
            sides.add("top")
        if tb.y0 < fb.y0 - 3:
            sides.add("bottom")
        if tb.x0 < fb.x0 - 3 or tb.x1 > fb.x1 + 3:
            sides.add("x")
    return sides


def _set_xtick_rotation(ax, degrees: float) -> None:
    ax.tick_params(axis="x", labelrotation=degrees)
    for lbl in ax.get_xticklabels():
        lbl.set_ha("right" if degrees else "center")


def _thin_xticks(ax) -> None:
    ticks = ax.get_xticks()
    labels = [t.get_text() for t in ax.get_xticklabels()]
    if len(ticks) < 4:
        return
    keep = list(range(0, len(ticks), 2))
    if keep[-1] != len(ticks) - 1:
        keep.append(len(ticks) - 1)
    ax.set_xticks([ticks[i] for i in keep])
    if labels and len(labels) == len(ticks):
        ax.set_xticklabels([labels[i] for i in keep])


def _place_legend(ax, style: dict[str, Any], placement: str) -> None:
    old = ax.get_legend()
    if old is None:
        return
    style["legend_loc"] = placement
    apply_legend(ax, style, True)


def _expand_ylim(ax, factor: float = 1.12) -> None:
    try:
        lo, hi = ax.get_ylim()
        span = hi - lo
        if span <= 0:
            return
        ax.set_ylim(lo, hi + span * (factor - 1.0))
    except Exception:
        pass


def _apply_margins(fig, style: dict[str, Any]) -> None:
    right = 0.78 if style.get("_need_right_margin") else 0.96
    bottom = 0.30 if style.get("_need_bottom_margin") else (0.22 if style.get("_rotated_ticks") else 0.16)
    top = 0.88
    left = 0.16
    try:
        fig.subplots_adjust(left=left, right=right, bottom=bottom, top=top)
    except Exception:
        pass


def solve_layout(fig, style: dict[str, Any], config: dict[str, Any] | None = None) -> list[dict[str, str]]:
    """就地改 fig/style，返回 L2 findings。"""
    del config  # 预留 spec 驱动
    findings: list[dict[str, str]] = []
    if fig is None or not getattr(fig, "axes", None):
        return findings

    try:
        from qa_report import set_last_geometry
        set_last_geometry({})
    except Exception:
        pass

    try:
        renderer = _renderer(fig)
    except Exception as exc:
        return [{
            "code": "label_overlap",
            "layer": "L2",
            "action": "warn",
            "message": f"布局探测跳过：{exc}",
        }]

    for ax in fig.axes:
        if _xtick_overlap(ax, renderer):
            _set_xtick_rotation(ax, 35)
            style["x_tick_rotation"] = 35
            style["_rotated_ticks"] = True
            findings.append({
                "code": "label_overlap",
                "layer": "L2",
                "action": "repair",
                "message": "X 刻度重叠，已旋转 35°",
            })
            try:
                renderer = _renderer(fig)
            except Exception:
                pass
            if _xtick_overlap(ax, renderer):
                _thin_xticks(ax)
                findings.append({
                    "code": "label_overlap",
                    "layer": "L2",
                    "action": "repair",
                    "message": "旋转后仍重叠，已抽稀刻度",
                })

        if _legend_covers_data(ax, renderer):
            _place_legend(ax, style, "outer-right")
            style["_need_right_margin"] = True
            findings.append({
                "code": "legend_covers_data",
                "layer": "L2",
                "action": "repair",
                "message": "图例挡数据，已外置到右侧",
            })
            try:
                renderer = _renderer(fig)
            except Exception:
                pass
            if _legend_covers_data(ax, renderer):
                _place_legend(ax, style, "outer-bottom")
                style["_need_right_margin"] = False
                style["_need_bottom_margin"] = True
                findings.append({
                    "code": "legend_covers_data",
                    "layer": "L2",
                    "action": "repair",
                    "message": "右侧仍挡数据，图例改到下方",
                })

        sides = _clip_sides(fig, renderer)
        if "top" in sides:
            _expand_ylim(ax, 1.12)
            findings.append({
                "code": "annotation_clipped",
                "layer": "L2",
                "action": "repair",
                "message": "标注出上沿，已抬高 y 轴",
            })
        if "bottom" in sides or "x" in sides:
            style["_need_bottom_margin"] = True
            if "x" in sides and not style.get("_rotated_ticks"):
                _set_xtick_rotation(ax, 35)
                style["x_tick_rotation"] = 35
                style["_rotated_ticks"] = True
            findings.append({
                "code": "annotation_clipped",
                "layer": "L2",
                "action": "repair",
                "message": "刻度/轴标溢出，已加边距",
            })

    _apply_margins(fig, style)
    try:
        from qa_report import set_last_geometry
        set_last_geometry(collect_geometry(fig))
    except Exception:
        pass
    return findings


def collect_geometry(fig) -> dict[str, Any]:
    """求解后几何快照：文本数 / 刻度重叠 / 图例挡数据。不做像素金标。"""
    n_texts = 0
    tick_overlap = False
    legend_covers = False
    try:
        renderer = _renderer(fig)
        for ax in fig.axes:
            texts = list(ax.texts) + list(ax.get_xticklabels()) + list(ax.get_yticklabels())
            if ax.title:
                texts.append(ax.title)
            if ax.xaxis.label:
                texts.append(ax.xaxis.label)
            if ax.yaxis.label:
                texts.append(ax.yaxis.label)
            n_texts += sum(1 for t in texts if t is not None and str(t.get_text()).strip())
            tick_overlap = tick_overlap or _xtick_overlap(ax, renderer)
            legend_covers = legend_covers or _legend_covers_data(ax, renderer)
    except Exception:
        pass
    return {
        "n_axes": len(getattr(fig, "axes", []) or []),
        "n_texts": n_texts,
        "xtick_overlap": tick_overlap,
        "legend_covers": legend_covers,
    }


def run_layout_and_save(
    fig,
    output_path: str,
    style: dict[str, Any],
    config: dict[str, Any] | None = None,
) -> list[str]:
    from qa_report import build_qa_report

    cfg = config if isinstance(config, dict) else {}
    try:
        layout_findings = solve_layout(fig, style, cfg)
    except Exception as exc:
        layout_findings = [{
            "code": "label_overlap",
            "layer": "L2",
            "action": "warn",
            "message": f"布局求解跳过：{exc}",
        }]
    build_qa_report(style, fig, cfg, layout_findings)
    return save_figure(fig, output_path, style)
