"""
ChartSpec V1 校验 — 与 src/contracts/chart-spec.ts 字段名对齐。
不依赖 matplotlib，供 plot_generic / qa_report 在渲染前调用。
"""
from __future__ import annotations

from typing import Any

CHART_SPEC_VERSION = 1

ARCHETYPES = frozenset({"quantitative", "schematic", "instrument", "dft"})
SOURCE_KINDS = frozenset({"csv", "projectIndex", "peaks", "vasp", "inline"})
ERROR_KINDS = frozenset({"sd", "se", "ci"})
LEGENDS = frozenset({"auto", "outer-right", "outer-bottom", "none"})
EXPORTS = frozenset({"png", "svg", "pdf", "tiff"})
PRESETS = frozenset({
    "nature", "agr_journal", "agr_cn", "ieee", "acs", "elsevier", "print_bw", "slide",
})

_REQUIRED = ("version", "archetype", "chartType", "claim", "data", "encoding", "journal", "caption")


def _is_dict(value: Any) -> bool:
    return isinstance(value, dict)


def validate_chart_spec(raw: Any) -> tuple[dict[str, Any] | None, list[str]]:
    """校验未知 JSON。成功返回 (spec, [])，失败返回 (None, errors)。"""
    errors: list[str] = []
    if not _is_dict(raw):
        return None, ["spec 必须是对象"]

    for key in _REQUIRED:
        if key not in raw:
            errors.append(f"缺少字段 {key}")
    if errors:
        return None, errors

    if raw.get("version") != CHART_SPEC_VERSION:
        errors.append(f"version 必须为 {CHART_SPEC_VERSION}")

    if raw.get("archetype") not in ARCHETYPES:
        errors.append("archetype 非法")

    chart_type = raw.get("chartType")
    if not isinstance(chart_type, str) or not chart_type.strip():
        errors.append("chartType 必须是非空字符串")

    if not isinstance(raw.get("claim"), str):
        errors.append("claim 必须是字符串")
    if not isinstance(raw.get("caption"), str):
        errors.append("caption 必须是字符串")

    data = raw.get("data")
    if not _is_dict(data) or data.get("sourceKind") not in SOURCE_KINDS:
        errors.append("data.sourceKind 非法")
    else:
        if "csv" in data and data["csv"] is not None and not isinstance(data["csv"], str):
            errors.append("data.csv 必须是字符串")
        if "chartIndex" in data and data["chartIndex"] is not None:
            if not isinstance(data["chartIndex"], int):
                errors.append("data.chartIndex 必须是整数")
        columns = data.get("columns")
        if columns is not None:
            if not _is_dict(columns) or not isinstance(columns.get("x"), str):
                errors.append("data.columns.x 必须是字符串")
            elif not isinstance(columns.get("y"), list) or not columns["y"]:
                errors.append("data.columns.y 必须是非空数组")
            else:
                err_map = columns.get("errors")
                if err_map is not None:
                    if not _is_dict(err_map) or any(v not in ERROR_KINDS for v in err_map.values()):
                        errors.append("data.columns.errors 值必须是 sd|se|ci")

    encoding = raw.get("encoding")
    if not _is_dict(encoding):
        errors.append("encoding 必须是对象")
    else:
        if not isinstance(encoding.get("xLabel"), str) or not isinstance(encoding.get("yLabel"), str):
            errors.append("encoding.xLabel / yLabel 必须是字符串")

    journal = raw.get("journal")
    if not _is_dict(journal):
        errors.append("journal 必须是对象")
    else:
        if journal.get("preset") not in PRESETS:
            errors.append("journal.preset 非法")
        if journal.get("columns") not in (1, 2):
            errors.append("journal.columns 必须是 1 或 2")
        formats = journal.get("exportFormats") or journal.get("export_formats")
        if formats is not None:
            if isinstance(formats, str):
                parts = [p.strip() for p in formats.replace(";", ",").split(",") if p.strip()]
            elif isinstance(formats, list):
                parts = [str(x).strip() for x in formats if str(x).strip()]
            else:
                parts = []
                errors.append("journal.exportFormats 必须是数组或逗号串")
            if parts and any(p not in EXPORTS for p in parts):
                errors.append("journal.exportFormats 含未知格式")

    layout = raw.get("layout")
    if layout is not None:
        if not _is_dict(layout):
            errors.append("layout 必须是对象")
        elif layout.get("legend") not in LEGENDS:
            errors.append("layout.legend 非法")

    if errors:
        return None, errors
    return raw, []


def parse_chart_spec(raw: Any) -> dict[str, Any] | None:
    spec, _errors = validate_chart_spec(raw)
    return spec


if __name__ == "__main__":
    sample = {
        "version": 1,
        "archetype": "quantitative",
        "chartType": "bar_grouped",
        "claim": "处理提高产量",
        "data": {
            "sourceKind": "inline",
            "labels": ["CK", "A"],
            "datasets": [{"label": "产量", "data": [12.0, 15.0]}],
            "columns": {"x": "处理", "y": ["产量"]},
        },
        "encoding": {"xLabel": "处理", "yLabel": "产量 (kg/ha)", "title": "产量"},
        "journal": {"preset": "nature", "columns": 1, "exportFormats": ["png", "svg"]},
        "layout": {"legend": "auto"},
        "caption": "图1 产量对比",
    }
    spec, errs = validate_chart_spec(sample)
    if errs:
        raise SystemExit("chart_spec self-check failed: " + "; ".join(errs))
    print("chart_spec self-check ok")
