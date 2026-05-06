"""
通用数据图表生成脚本（matplotlib）
用法: python plot_generic.py --data <csv_path> --config <json_path> --output <png_path>

config JSON 格式:
{
  "chart_type": "bar" | "line" | "scatter" | "pie",
  "title": "图表标题",
  "x_column": "X轴列名",
  "y_column": "Y轴列名",
  "x_label": "X轴标签",
  "y_label": "Y轴标签",
  "color": "#4A90D9"
}
"""

import argparse
import json
import sys
import traceback

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

# 中文字体支持
plt.rcParams["font.sans-serif"] = ["SimHei", "Microsoft YaHei", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False


def load_dataframe(data_path: str):
    """自动检测文件格式和编码加载数据，支持 CSV 和 Excel"""
    import io

    raw = open(data_path, "rb").read()

    # 检测是否是 XLSX/Excel（ZIP 文件头 PK\x03\x04），不管扩展名
    if raw[:2] == b"PK":
        import zipfile
        # 直接尝试所有 Excel 引擎
        for eng in ["openpyxl", "xlrd", None]:
            try:
                return pd.read_excel(data_path, engine=eng)
            except Exception:
                continue
        # 如果 read_excel 都失败，尝试从 ZIP 中提取 CSV
        try:
            with zipfile.ZipFile(data_path) as z:
                csv_files = [n for n in z.namelist() if n.endswith(".csv")]
                if csv_files:
                    with z.open(csv_files[0]) as f:
                        return pd.read_csv(f)
        except Exception:
            pass
        # 确实是 ZIP 但无法解析，继续尝试 CSV 路径可能浪费，先报错
        raise ValueError(
            f"文件是 ZIP/Excel 格式但无法解析，请确认文件为有效的 .xlsx 文件"
        )

    # CSV/TXT → 先读二进制，再按编码解码为文本，最后解析 CSV

    # 尝试所有编码，先解码文本，再用 StringIO 解析
    encodings_to_try = []
    # 检测 BOM
    if raw[:3] == b"\xef\xbb\xbf":
        encodings_to_try = ["utf-8-sig", "gbk", "gb2312", "latin-1"]
    elif raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        encodings_to_try = ["utf-16", "utf-8", "gbk"]
    else:
        encodings_to_try = ["utf-8", "gbk", "gb2312", "latin-1", "utf-16"]

    for encoding in encodings_to_try:
        try:
            text = raw.decode(encoding)
        except (UnicodeDecodeError, LookupError):
            continue

        # 对已正确解码的文本，尝试多种分隔符
        for sep in [",", "\t", ";", "|", " "]:
            try:
                df = pd.read_csv(io.StringIO(text), sep=sep)
                if len(df.columns) >= 1 and len(df) > 0:
                    return df
            except Exception:
                continue

        # 如果编码对了但分隔符都不行，再试无头模式
        try:
            df = pd.read_csv(io.StringIO(text), sep=None, engine="python")
            if len(df.columns) >= 1 and len(df) > 0:
                return df
        except Exception:
            continue

    # 全部失败 → 输出文件头信息帮助诊断
    preview = raw[:200]
    raise ValueError(
        f"无法读取数据文件。已尝试编码: {encodings_to_try}。"
        f"文件前200字节: {preview!r}"
    )


def plot_chart(data_path: str, config: dict, output_path: str):
    df = load_dataframe(data_path)
    chart_type = config.get("chart_type", "line")
    title = config.get("title", "")
    x_col = config.get("x_column")
    y_col = config.get("y_column")
    x_label = config.get("x_label", x_col or "")
    y_label = config.get("y_label", y_col or "")
    color = config.get("color", "#4A90D9")

    if not x_col or x_col not in df.columns:
        x_col = df.columns[0]
    if not y_col or y_col not in df.columns:
        y_col = df.columns[1] if len(df.columns) > 1 else df.columns[0]

    x_data = df[x_col].astype(str).tolist()
    y_data = pd.to_numeric(df[y_col], errors="coerce").tolist()

    fig, ax = plt.subplots(figsize=(8, 5))

    if chart_type == "pie":
        wedges, texts, autotexts = ax.pie(
            y_data,
            labels=x_data,
            autopct="%1.1f%%",
            colors=[color],
            startangle=90,
        )
        ax.set_title(title, fontsize=14, pad=20)
    elif chart_type == "scatter":
        x_num = pd.to_numeric(df[x_col], errors="coerce").tolist()
        ax.scatter(x_num, y_data, c=color, s=60, alpha=0.7, edgecolors="black", linewidth=0.5)
        ax.set_xlabel(x_label, fontsize=12)
        ax.set_ylabel(y_label, fontsize=12)
        ax.set_title(title, fontsize=14)
        ax.grid(True, alpha=0.3)
    else:
        bars = ax.bar(x_data, y_data, color=color, edgecolor="white", linewidth=0.5) if chart_type == "bar" else None
        if chart_type == "line":
            ax.plot(x_data, y_data, color=color, marker="o", linewidth=2, markersize=6)
            ax.fill_between(range(len(x_data)), y_data, alpha=0.1, color=color)
        elif chart_type == "bar":
            bars = ax.bar(x_data, y_data, color=color, edgecolor="white", linewidth=0.5)
        ax.set_xlabel(x_label, fontsize=12)
        ax.set_ylabel(y_label, fontsize=12)
        ax.set_title(title, fontsize=14)
        ax.tick_params(axis="x", rotation=45 if len(x_data) > 5 else 0)
        ax.grid(axis="y", alpha=0.3)

    plt.tight_layout()
    fig.savefig(output_path, dpi=200, bbox_inches="tight")
    plt.close(fig)
    print(json.dumps({"status": "ok", "output": output_path}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, help="CSV 数据文件路径")
    parser.add_argument("--config", required=True, help="JSON 配置文件路径")
    parser.add_argument("--output", required=True, help="输出 PNG 路径")
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    try:
        plot_chart(args.data, cfg, args.output)
    except Exception as e:
        err_msg = json.dumps({"status": "error", "message": str(e)})
        print(err_msg)  # to stdout (captured by API)
        print(err_msg, file=sys.stderr)  # to stderr (also captured)
        sys.stderr.flush()
        sys.exit(1)
