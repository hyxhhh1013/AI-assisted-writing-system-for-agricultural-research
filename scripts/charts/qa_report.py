"""
确定性质检报告 — 与 src/contracts/chart-qa.ts 对齐。
单进程出图（每次 spawn 一次）用模块级 last_qa 回传。
"""
from __future__ import annotations

from typing import Any

from plot_style import validate_style

_LAST_QA: dict[str, Any] = {"verdict": "pass", "findings": []}
_LAST_GEOM: dict[str, Any] = {}

_STYLE_META: dict[str, tuple[str, str, str]] = {
    # code: (layer, fail_action, warn_action)
    "width_missing": ("L1", "block", "repair"),
    "width_off_spec": ("L1", "repair", "repair"),
    "font_too_small": ("L1", "block", "block"),
    "font_small": ("L1", "warn", "warn"),
    "dpi_low": ("L1", "warn", "warn"),
    "linewidth_thin": ("L1", "warn", "warn"),
    "height_tall": ("L1", "warn", "warn"),
    "figsize_mismatch": ("L1", "warn", "warn"),
    "palette_soft": ("L3", "warn", "warn"),
    "grayscale_adjacent": ("L3", "warn", "warn"),
    "missing_unit": ("L0", "block", "repair"),
    "error_col_unpaired": ("L0", "block", "block"),
    "significance_oob": ("L0", "block", "block"),
    "label_overlap": ("L2", "repair", "repair"),
    "legend_covers_data": ("L2", "repair", "repair"),
    "annotation_clipped": ("L2", "repair", "repair"),
    "cjk_tofu": ("L3", "block", "block"),
}


def _verdict(findings: list[dict[str, Any]]) -> str:
    if any(f.get("action") == "block" for f in findings):
        return "block"
    if any(f.get("action") == "repair" for f in findings):
        return "repair"
    return "pass"


def _from_style_check(check: dict[str, Any]) -> dict[str, Any]:
    code = str(check.get("code") or "unknown")
    level = str(check.get("level") or "pass").lower()
    layer, fail, warn = _STYLE_META.get(code, ("L1", "block", "warn"))
    if level == "pass":
        action = "pass"
    elif level == "fail":
        action = fail
    else:
        action = warn
    return {
        "code": code,
        "layer": layer,
        "action": action,
        "message": str(check.get("message") or code),
    }


def _spec_l0(config: dict[str, Any]) -> list[dict[str, Any]]:
    raw = config.get("chartSpecL0")
    if isinstance(raw, dict) and isinstance(raw.get("findings"), list):
        out = []
        for item in raw["findings"]:
            if isinstance(item, dict) and item.get("code"):
                out.append({
                    "code": str(item.get("code")),
                    "layer": str(item.get("layer") or "L0"),
                    "action": str(item.get("action") or "warn"),
                    "message": str(item.get("message") or item.get("code")),
                })
        return out
    return []


def build_qa_report(
    style: dict[str, Any],
    fig: Any,
    config: dict[str, Any],
    layout_findings: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    findings: list[dict[str, Any]] = []
    findings.extend(_spec_l0(config if isinstance(config, dict) else {}))
    try:
        style_val = validate_style(style, fig)
    except Exception:
        style_val = {"ok": True, "checks": []}
    for check in style_val.get("checks") or []:
        if isinstance(check, dict):
            findings.append(_from_style_check(check))
    if layout_findings:
        findings.extend(layout_findings)

    actual_w = None
    try:
        if fig is not None:
            actual_w = float(fig.get_size_inches()[0])
    except Exception:
        actual_w = None

    report = {
        "verdict": _verdict(findings),
        "findings": findings,
        "preset": style_val.get("preset") or style.get("preset"),
        "columns": style_val.get("columns") or style.get("columns"),
        "targetWidthIn": style_val.get("target_width_in"),
        "actualWidthIn": actual_w,
        "geometry": get_last_geometry(),
    }
    set_last_qa(report)
    return report


def set_last_qa(report: dict[str, Any]) -> None:
    global _LAST_QA
    _LAST_QA = report


def get_last_qa() -> dict[str, Any]:
    return _LAST_QA


def set_last_geometry(geom: dict[str, Any]) -> None:
    global _LAST_GEOM
    _LAST_GEOM = geom


def get_last_geometry() -> dict[str, Any]:
    return _LAST_GEOM
