#!/usr/bin/env python3
"""
GB/T 7714 三线表生成 + 统计文字生成
用法: python make_table.py --config <json_path> --output <dir_path>

config JSON 格式:
{
  "title": "表1 不同处理对产量的影响",
  "groups": [
    {"label": "处理A", "n": 30, "mean": 12.3, "sd": 1.2},
    {"label": "处理B", "n": 30, "mean": 15.7, "sd": 0.9},
    {"label": "处理C", "n": 30, "mean": 10.2, "sd": 1.5}
  ],
  "anova": {"F": 8.43, "df1": 2, "df2": 87, "p": 0.0004},
  "posthoc": [
    {"pair": ["A","B"], "p": 0.023},
    {"pair": ["A","C"], "p": 0.31},
    {"pair": ["B","C"], "p": 0.0001}
  ],
  "alpha": 0.05,
  "note": "数据以均值±标准差表示。同列不同小写字母表示差异显著（P<0.05）。",
  "column_header": "产量 (kg/ha)"
}
"""

import argparse
import json
import math
import os
import sys
from typing import Any


def _safe_float(v: Any, default: float = 0.0) -> float:
    """数值容错：字符串/缺失转浮点失败时用默认值，避免 KeyError/ValueError 崩脚本。"""
    try:
        f = float(v)
        return f if f == f else default  # NaN → default
    except (TypeError, ValueError):
        return default


def _assign_superscript_letters(
    groups: list[dict],
    posthoc: list[dict],
    alpha: float = 0.05,
) -> list[str]:
    """根据 post-hoc 检验结果给各组分配上标字母（a, b, c...）。

    规则：
    - 两个组 p < alpha → 显著不同 → 不同字母
    - 两个组 p >= alpha → 无显著差异 → 可共享字母
    - 字母从 'a' 开始，尽量用最少字母覆盖所有差异模式
    """
    n = len(groups)
    # 容错：缺 label / mean 时用占位，避免 KeyError 崩脚本
    labels = [g.get("label", f"组{i + 1}") for i, g in enumerate(groups)]

    # 构建两两比较矩阵：sig[i][j] = True 表示 i 和 j 显著不同
    sig = [[False] * n for _ in range(n)]
    def _match_label(key: str) -> int | None:
        """灵活匹配：先精确匹配，再尝试 startswith / 包含匹配"""
        if key in labels:
            return labels.index(key)
        for li, lb in enumerate(labels):
            if lb.startswith(key) or key.startswith(lb) or key in lb or lb in key:
                return li
        return None

    for ph in posthoc:
        if not isinstance(ph, dict):
            continue
        pair = ph.get("pair")
        p_val = ph.get("p")
        if not pair or not isinstance(pair, (list, tuple)) or len(pair) < 2:
            continue
        try:
            p_val = float(p_val)
        except (TypeError, ValueError):
            continue
        i = _match_label(pair[0])
        j = _match_label(pair[1])
        if i is None or j is None:
            continue
        if p_val < alpha:
            sig[i][j] = sig[j][i] = True

    # 按均值降序排列（高产在前），维护原始索引映射
    indexed = sorted(
        [(i, groups[i].get("mean", 0)) for i in range(n)],
        key=lambda x: -x[1],
    )
    order = [i for i, _ in indexed]

    # 分配字母
    letters = [""] * n
    available = 0  # 下一个可用字母的索引 (0='a', 1='b', ...)

    for rank, idx in enumerate(order):
        if rank == 0:
            letters[idx] = chr(ord("a") + available)
            continue

        # 检查与前面各组：若有显著差异且对方只有该字母，则需要新字母
        need_new = True
        for prev_idx in order[:rank]:
            if not sig[idx][prev_idx]:
                # 无显著差异，可共享字母
                need_new = False
                break

        if need_new:
            available += 1
            if available > 25:
                available = 25  # 最多 26 个字母
            letters[idx] = chr(ord("a") + available)
        else:
            # 与最近的同字母组共享
            for prev_idx in order[:rank]:
                if not sig[idx][prev_idx]:
                    letters[idx] = letters[prev_idx]
                    break

    return letters


def _format_p(p_val: float) -> str:
    """格式化 p 值为标准学术表述"""
    if p_val < 0.001:
        return "P<0.001"
    elif p_val < 0.01:
        return f"P={p_val:.3f}"
    elif p_val < 0.05:
        return f"P={p_val:.3f}"
    else:
        return f"P={p_val:.3f}"


def _build_stats_text(
    groups: list[dict],
    anova: dict | None,
    posthoc: list[dict],
    letters: list[str],
    column_header: str = "指标",
) -> str:
    """生成学术 Results 文字段落"""
    parts = []

    # 描述性统计
    desc_parts = []
    for i, g in enumerate(groups):
        desc_parts.append(
            f"{g['label']}（M={g['mean']:.1f}, SD={g['sd']:.1f}）"
        )
    parts.append("、".join(desc_parts) + "。")

    # ANOVA
    if anova:
        f_val = _safe_float(anova.get("F"))
        df1 = _safe_float(anova.get("df1"))
        df2 = _safe_float(anova.get("df2"))
        p_val = _safe_float(anova.get("p"), 1.0)
        p_str = _format_p(p_val)
        parts.append(
            f"单因素方差分析显示，处理间{column_header}差异"
            f"{'显著' if p_val < 0.05 else '不显著'}（F({df1},{df2})={f_val:.2f}, {p_str}）。"
        )

    # Post-hoc
    if posthoc and anova and anova.get("p", 1) < 0.05:
        sig_pairs = []
        for ph in posthoc:
            if ph["p"] < 0.05:
                sig_pairs.append((ph["pair"][0], ph["pair"][1], ph["p"]))

        if sig_pairs:
            pair_texts = []
            for a, b, p in sig_pairs:
                la = next((g["label"] for g in groups if a in g["label"] or g["label"] in a), a)
                lb = next((g["label"] for g in groups if b in g["label"] or g["label"] in b), b)
                pair_texts.append(f"{la}与{lb}差异显著（{_format_p(p)}）")
            parts.append("事后检验表明：" + "；".join(pair_texts) + "。")

        # 非显著对
        ns_pairs = []
        for ph in posthoc:
            if ph["p"] >= 0.05:
                ns_pairs.append((ph["pair"][0], ph["pair"][1]))
        if ns_pairs:
            ns_texts = [f"{a}与{b}无显著差异" for a, b in ns_pairs]
            parts.append("；".join(ns_texts) + "。")

    # 字母标注
    uniq_letters = sorted(set(letters))
    letter_notes = []
    for lt in uniq_letters:
        same = [g["label"] for i, g in enumerate(groups) if letters[i] == lt]
        letter_notes.append(f"字母 {lt}：{'、'.join(same)}")
    parts.append("同列不同字母表示差异显著（P<0.05）。" + " ".join(letter_notes))

    return "\n\n".join(parts)


def _build_latex_table(
    title: str,
    groups: list[dict],
    letters: list[str],
    column_header: str = "指标",
    note: str = "",
) -> str:
    """生成 LaTeX 三线表（booktabs 风格）"""
    lines = []
    lines.append("\\begin{table}[htbp]")
    lines.append("  \\centering")
    lines.append(f"  \\caption{{{title}}}")
    lines.append("  \\begin{tabular}{l" + "c" * len(groups) + "}")
    lines.append("    \\toprule")

    # 表头
    headers = [column_header] + [g["label"] for g in groups]
    lines.append("    " + " & ".join(headers) + " \\\\")
    lines.append("    \\midrule")

    # 数据行：均值 ± SD
    mean_row = ["    均值"] + [
        f"{g['mean']:.1f} ± {g['sd']:.1f}\\textsuperscript{{{letters[i]}}}"
        for i, g in enumerate(groups)
    ]
    lines.append("    " + " & ".join(mean_row) + " \\\\")

    # N 行（可选）
    n_row = ["    n"] + [str(g.get("n", "")) for g in groups]
    lines.append("    " + " & ".join(n_row) + " \\\\")

    lines.append("    \\bottomrule")
    lines.append("  \\end{tabular}")

    if note:
        lines.append(f"  \\tablenotes{{{note}}}")

    lines.append("\\end{table}")
    return "\n".join(lines)


def _build_html_table(
    title: str,
    groups: list[dict],
    letters: list[str],
    column_header: str = "指标",
    note: str = "",
) -> str:
    """生成 HTML 三线表（预览用）"""
    css = """<style>
.three-line-table { border-collapse: collapse; font-family: 'Times New Roman', SimSun, serif; font-size: 10pt; margin: 1em auto; }
.three-line-table caption { font-weight: bold; margin-bottom: 6px; }
.three-line-table thead { border-top: 1.5pt solid black; border-bottom: 0.75pt solid black; }
.three-line-table tbody { border-bottom: 1.5pt solid black; }
.three-line-table th, .three-line-table td { padding: 4px 12px; text-align: center; }
.three-line-table sup { font-size: 0.8em; }
.three-line-table .note { font-size: 8pt; text-align: left; padding-top: 6px; border: none; }
</style>"""

    rows = []
    rows.append(f'<table class="three-line-table">')
    rows.append(f"  <caption>{title}</caption>")
    rows.append("  <thead>")
    rows.append("    <tr>")
    rows.append(f"      <th>{column_header}</th>")
    for g in groups:
        rows.append(f"      <th>{g['label']}</th>")
    rows.append("    </tr>")
    rows.append("  </thead>")
    rows.append("  <tbody>")

    # 均值行
    rows.append('    <tr>')
    rows.append('      <td style="text-align:left">均值 ± SD</td>')
    for i, g in enumerate(groups):
        rows.append(
            f"      <td>{g['mean']:.1f} ± {g['sd']:.1f}<sup>{letters[i]}</sup></td>"
        )
    rows.append("    </tr>")

    # N 行
    rows.append("    <tr>")
    rows.append('      <td style="text-align:left">n</td>')
    for g in groups:
        rows.append(f"      <td>{g.get('n', '')}</td>")
    rows.append("    </tr>")

    rows.append("  </tbody>")
    rows.append("</table>")

    if note:
        rows.append(f'<p class="note">{note}</p>')

    return css + "\n" + "\n".join(rows)


def make_table(config_path: str, output_dir: str):
    with open(config_path, "r", encoding="utf-8") as f:
        cfg: dict[str, Any] = json.load(f)

    title: str = cfg.get("title", "表 数据汇总")
    groups: list[dict] = cfg.get("groups", [])
    anova: dict | None = cfg.get("anova")
    posthoc: list[dict] = cfg.get("posthoc", [])
    alpha: float = cfg.get("alpha", 0.05)
    note: str = cfg.get("note", "数据以均值±标准差表示。同列不同小写字母表示差异显著（P<0.05）。")
    column_header: str = cfg.get("column_header", "指标")

    if not groups:
        print(json.dumps({"status": "error", "message": "groups 为空"}))
        sys.exit(1)

    # 容错归一化：缺 label/mean/sd/n 补默认，非法 posthoc / anova 丢弃或兜底
    groups = [
        {
            "label": str(g.get("label", f"组{i + 1}")),
            "n": g.get("n", ""),
            "mean": _safe_float(g.get("mean")),
            "sd": _safe_float(g.get("sd")),
        }
        for i, g in enumerate(groups)
        if isinstance(g, dict)
    ]
    if not groups:
        print(json.dumps({"status": "error", "message": "groups 缺少有效分组"}))
        sys.exit(1)
    posthoc = [
        ph
        for ph in posthoc
        if isinstance(ph, dict)
        and isinstance(ph.get("pair"), (list, tuple))
        and len(ph.get("pair", [])) >= 2
        and isinstance(ph.get("p"), (int, float))
    ]
    if anova is not None and not isinstance(anova, dict):
        anova = None

    # 分配字母
    letters = _assign_superscript_letters(groups, posthoc, alpha)

    os.makedirs(output_dir, exist_ok=True)

    # 生成 LaTeX
    latex = _build_latex_table(title, groups, letters, column_header, note)
    with open(os.path.join(output_dir, "table.tex"), "w", encoding="utf-8") as f:
        f.write(latex)

    # 生成 HTML
    html = _build_html_table(title, groups, letters, column_header, note)
    with open(os.path.join(output_dir, "table.html"), "w", encoding="utf-8") as f:
        f.write(html)

    # 生成统计文字
    stats = _build_stats_text(groups, anova, posthoc, letters, column_header)
    with open(os.path.join(output_dir, "stats.txt"), "w", encoding="utf-8") as f:
        f.write(stats)

    result = {
        "status": "ok",
        "letters": {g["label"]: lt for g, lt in zip(groups, letters)},
        "stats_text": stats,
        "latex": latex,
        "html": html,
    }
    out_path = os.path.join(output_dir, "result.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    sys.stdout.reconfigure(encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, help="JSON 配置文件路径")
    parser.add_argument("--output", required=True, help="输出目录路径")
    args = parser.parse_args()

    try:
        make_table(args.config, args.output)
    except Exception as e:
        import traceback
        err = {"status": "error", "message": str(e), "traceback": traceback.format_exc()}
        print(json.dumps(err, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
