"""
FIG-QA-006：golden fixtures 回归。
对每个 CSV 出图，断言 qaReport 无 block，并核对几何快照。
不做跨机器像素金标；缺字用 glyph 探测。
"""
from __future__ import annotations

import io
import json
import os
import sys
import tempfile
import traceback
from contextlib import redirect_stdout
from typing import Any

CHARTS_DIR = os.path.dirname(os.path.abspath(__file__))
FIXTURE_DIR = os.path.join(CHARTS_DIR, "_fixtures", "qa")
sys.path.insert(0, CHARTS_DIR)

from font_setup import apply_cjk_font_rcparams, cjk_font_available, missing_cjk_glyphs  # noqa: E402
from plot_generic import plot_chart  # noqa: E402
from qa_report import get_last_qa  # noqa: E402

UNITLESS = frozenset({"pie", "radar", "heatmap"})


def _load_manifest() -> list[dict[str, Any]]:
    path = os.path.join(FIXTURE_DIR, "manifest.json")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    cases = data.get("cases")
    if not isinstance(cases, list) or not cases:
        raise SystemExit("manifest.json 缺少 cases")
    return cases


def _build_config(case: dict[str, Any]) -> dict[str, Any]:
    chart_type = str(case["chartType"])
    x_label = str(case.get("xLabel") or "")
    y_label = str(case.get("yLabel") or "")
    unitless = chart_type in UNITLESS
    columns = int(case.get("columns") or (2 if case.get("cjk") else 1))
    columns = 2 if columns >= 2 else 1
    preset = str(case.get("preset") or "nature")
    exports = case.get("exportFormats") or ["png"]
    spec: dict[str, Any] = {
        "version": 1,
        "archetype": "quantitative",
        "chartType": chart_type,
        "claim": f"golden fixture {case['id']}",
        "data": {"sourceKind": "csv"},
        "encoding": {
            "xLabel": x_label,
            "yLabel": y_label,
            "unitless": unitless,
        },
        "journal": {
            "preset": preset,
            "columns": columns,
            "exportFormats": exports,
        },
        "layout": {},
        "caption": "",
    }
    if case.get("significance"):
        spec["annotations"] = {"significance": case["significance"]}
    config: dict[str, Any] = {
        "chart_type": chart_type,
        "title": str(case.get("title") or case["id"]),
        "x_label": x_label,
        "y_label": y_label,
        "preset": preset,
        "columns": columns,
        "export_formats": exports,
        "chartSpec": spec,
        "chartSpecL0": {"verdict": "pass", "findings": []},
    }
    return config


def _run_case(case: dict[str, Any], out_dir: str) -> dict[str, Any]:
    csv_name = str(case["csv"])
    csv_path = os.path.join(FIXTURE_DIR, csv_name)
    if not os.path.isfile(csv_path):
        raise FileNotFoundError(csv_path)
    png_path = os.path.join(out_dir, f"{case['id']}.png")
    buf = io.StringIO()
    with redirect_stdout(buf):
        plot_chart(csv_path, _build_config(case), png_path)
    printed = buf.getvalue().strip()
    payload: dict[str, Any] = {}
    if printed:
        try:
            payload = json.loads(printed.splitlines()[-1])
        except json.JSONDecodeError:
            payload = {"status": "error", "message": printed[:400]}
    report = get_last_qa() or {}
    payload["qaReport"] = report
    payload["_png"] = png_path
    return payload


def _cjk_sample(case: dict[str, Any]) -> str:
    csv_path = os.path.join(FIXTURE_DIR, str(case["csv"]))
    with open(csv_path, encoding="utf-8") as f:
        body = f.read()
    return body + str(case.get("xLabel") or "") + str(case.get("yLabel") or "")


def _check(case: dict[str, Any], payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if payload.get("status") != "ok":
        errors.append(f"出图失败：{payload.get('message') or payload}")
        return errors
    if not os.path.isfile(payload.get("_png") or ""):
        errors.append("未写出 PNG")

    report = payload.get("qaReport") or {}
    findings = [f for f in (report.get("findings") or []) if isinstance(f, dict)]
    blocks = [f for f in findings if f.get("action") == "block"]
    if blocks:
        codes = ", ".join(f"{f.get('code')}:{f.get('message')}" for f in blocks)
        errors.append(f"qaReport block：{codes}")
    if report.get("verdict") == "block":
        errors.append("verdict=block")

    geom = report.get("geometry") or {}
    min_texts = int(case.get("minTexts") or 1)
    n_texts = int(geom.get("n_texts") or 0)
    if n_texts < min_texts:
        errors.append(f"文本过少：n_texts={n_texts} < {min_texts}")
    if geom.get("xtick_overlap"):
        errors.append("求解后仍有 xtick_overlap")
    if geom.get("legend_covers"):
        errors.append("求解后仍有 legend_covers")
    if int(geom.get("n_axes") or 0) < 1:
        errors.append("n_axes < 1")

    if case.get("cjk"):
        font = cjk_font_available()
        if not font:
            print("  skip CJK glyph：本机无 CJK 字体")
        else:
            missing = missing_cjk_glyphs(_cjk_sample(case), font)
            if missing:
                errors.append(f"CJK 缺字 {font}：{''.join(missing)}")

    if case.get("assertWidth"):
        actual = report.get("actualWidthIn")
        target = report.get("targetWidthIn")
        try:
            actual_f = float(actual)
            target_f = float(target)
        except (TypeError, ValueError):
            errors.append(f"缺刊宽：actual={actual} target={target}")
        else:
            if target_f <= 0 or abs(actual_f - target_f) / target_f > 0.08:
                errors.append(f"刊宽超差：{actual_f:.3f} vs {target_f:.3f} in")

    for fmt in case.get("assertExports") or []:
        stem = os.path.splitext(str(payload.get("_png") or ""))[0]
        path = f"{stem}.{fmt}"
        if not os.path.isfile(path):
            errors.append(f"缺导出 {fmt}：{path}")

    return errors


def main() -> int:
    apply_cjk_font_rcparams()
    cases = _load_manifest()
    failed = 0
    with tempfile.TemporaryDirectory(prefix="fig-qa-") as tmp:
        for case in cases:
            cid = case.get("id", "?")
            payload: dict[str, Any] = {}
            try:
                payload = _run_case(case, tmp)
                errors = _check(case, payload)
            except Exception as exc:
                errors = [f"异常：{exc}"]
                traceback.print_exc()
            report = payload.get("qaReport") or {}
            geom = report.get("geometry") or {}
            verdict = report.get("verdict", "?")
            if errors:
                failed += 1
                print(f"FAIL {cid}  verdict={verdict}  geom={geom}")
                for err in errors:
                    print(f"  - {err}")
            else:
                print(
                    f"PASS {cid}  verdict={verdict}  "
                    f"n_texts={geom.get('n_texts')} n_axes={geom.get('n_axes')}"
                )
    total = len(cases)
    print(f"\n{total - failed}/{total} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
