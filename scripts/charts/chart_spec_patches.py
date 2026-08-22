"""
ChartSpec 补丁表 — 与 src/lib/chart-spec-patches.ts 对齐。
热路径重渲由 TS chart-runner 驱动；本模块供同进程复用 / 对照。
"""
from __future__ import annotations

import re
from copy import deepcopy
from typing import Any

_COL_UNIT_RE = re.compile(r"^(.+?)\s*[（(]([^）)]+)[）)]\s*$")


def _unit_from_name(name: str) -> str | None:
    m = _COL_UNIT_RE.match(name.strip())
    if not m:
        return None
    return f"{m.group(1).strip()} ({m.group(2).strip()})"


def _next_legend(current: str | None) -> str | None:
    if current in (None, "", "auto"):
        return "outer-right"
    if current == "outer-right":
        return "outer-bottom"
    return None


def apply_chart_spec_patches(
    spec: dict[str, Any],
    findings: list[dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    next_spec = deepcopy(spec)
    patches: list[dict[str, Any]] = []
    codes = {
        str(f.get("code"))
        for f in findings
        if f.get("action") == "repair" or (f.get("action") == "block" and f.get("code") == "missing_unit")
    }
    layout = next_spec.setdefault("layout", {"legend": "auto"})
    if not isinstance(layout, dict):
        layout = {"legend": "auto"}
        next_spec["layout"] = layout

    if "label_overlap" in codes or "annotation_clipped" in codes:
        before = layout.get("xTickRotation") or 0
        if before < 35:
            layout["xTickRotation"] = 35
            patches.append({
                "code": "label_overlap" if "label_overlap" in codes else "annotation_clipped",
                "path": "layout.xTickRotation",
                "before": before,
                "after": 35,
            })

    if "legend_covers_data" in codes:
        after = _next_legend(layout.get("legend"))
        if after:
            patches.append({
                "code": "legend_covers_data",
                "path": "layout.legend",
                "before": layout.get("legend"),
                "after": after,
            })
            layout["legend"] = after

    encoding = next_spec.get("encoding") if isinstance(next_spec.get("encoding"), dict) else {}
    if "missing_unit" in codes and not encoding.get("unitless"):
        y_label = str(encoding.get("yLabel") or "")
        if not _COL_UNIT_RE.search(y_label):
            names: list[str] = []
            columns = next_spec.get("data", {}).get("columns") if isinstance(next_spec.get("data"), dict) else None
            if isinstance(columns, dict) and isinstance(columns.get("y"), list):
                names.extend(str(x) for x in columns["y"])
            for name in names:
                filled = _unit_from_name(name)
                if filled:
                    patches.append({
                        "code": "missing_unit",
                        "path": "encoding.yLabel",
                        "before": y_label,
                        "after": filled,
                    })
                    encoding["yLabel"] = filled
                    next_spec["encoding"] = encoding
                    break

    return next_spec, patches
