"""Build the 2026-09-30 stage-report deck.

Usage: python scripts/build-stage-report-pptx.py
Output: docs/reports/阶段汇报-2026-09-30-下一期投入.pptx
"""

from __future__ import annotations

from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "reports" / "阶段汇报-2026-09-30-下一期投入.pptx"

FONT = "Microsoft YaHei"
INK = RGBColor(0x1B, 0x3A, 0x2F)
INK_SOFT = RGBColor(0x24, 0x4A, 0x3C)
PAPER = RGBColor(0xF6, 0xF3, 0xEC)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GOLD = RGBColor(0xA0, 0x78, 0x32)
MUTED = RGBColor(0x5E, 0x68, 0x62)
BODY = RGBColor(0x1E, 0x28, 0x24)
LINE = RGBColor(0xE2, 0xDB, 0xCE)
SOFT = RGBColor(0xE7, 0xF0, 0xEA)
WARM = RGBColor(0xF8, 0xF1, 0xE3)
CARD_ALT = RGBColor(0xF4, 0xF7, 0xF4)

SLIDE_W = 13.333
SLIDE_H = 7.5
TOTAL = 22


def set_font(run, size: float, bold: bool, color: RGBColor) -> None:
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.name = FONT
    run.font.color.rgb = color
    r_pr = run._r.get_or_add_rPr()
    for tag in ("latin", "ea", "cs"):
        el = r_pr.find(qn(f"a:{tag}"))
        if el is None:
            el = r_pr.makeelement(qn(f"a:{tag}"), {})
            r_pr.append(el)
        el.set("typeface", FONT)


def add_shape(slide, kind, x, y, w, h, fill: RGBColor, line: RGBColor | None = None):
    shape = slide.shapes.add_shape(kind, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    if line is None:
        shape.line.fill.background()
    else:
        shape.line.color.rgb = line
        shape.line.width = Pt(1)
    return shape


def add_text(
    slide,
    text: str,
    x,
    y,
    w,
    h,
    size=16,
    bold=False,
    color=BODY,
    align=PP_ALIGN.LEFT,
    anchor=MSO_ANCHOR.TOP,
):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    body_pr = tf._txBody.bodyPr
    body_pr.set(
        "anchor",
        {MSO_ANCHOR.TOP: "t", MSO_ANCHOR.MIDDLE: "ctr", MSO_ANCHOR.BOTTOM: "b"}[anchor],
    )
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    set_font(run, size, bold, color)
    return box


def add_lines(slide, lines: list[str], x, y, w, h, size=16, color=BODY, gap=8, bold=False):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = PP_ALIGN.LEFT
        p.space_after = Pt(gap)
        run = p.add_run()
        run.text = line
        set_font(run, size, bold, color)
    return box


def set_cell_border(cell, color="E2DBCE", sz="6350") -> None:
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    for edge in ("lnL", "lnR", "lnT", "lnB"):
        existing = tc_pr.find(qn(f"a:{edge}"))
        if existing is not None:
            tc_pr.remove(existing)
        ln = etree.SubElement(tc_pr, qn(f"a:{edge}"))
        ln.set("w", sz)
        ln.set("cap", "flat")
        ln.set("cmpd", "sng")
        ln.set("algn", "ctr")
        solid = etree.SubElement(ln, qn("a:solidFill"))
        srgb = etree.SubElement(solid, qn("a:srgbClr"))
        srgb.set("val", color)
        etree.SubElement(ln, qn("a:prstDash")).set("val", "solid")


def paint_cell(cell, text, size, bold, color, fill, align=PP_ALIGN.LEFT) -> None:
    cell.fill.solid()
    cell.fill.fore_color.rgb = fill
    cell.vertical_anchor = MSO_ANCHOR.MIDDLE
    cell.margin_left = Inches(0.1)
    cell.margin_right = Inches(0.08)
    cell.margin_top = Inches(0.06)
    cell.margin_bottom = Inches(0.06)
    tf = cell.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    set_font(run, size, bold, color)
    set_cell_border(cell)


def add_table(slide, rows: list[list[str]], x, y, w, h, col_w: list[float], size=13):
    table_shape = slide.shapes.add_table(len(rows), len(rows[0]), Inches(x), Inches(y), Inches(w), Inches(h))
    table = table_shape.table
    for i, width in enumerate(col_w):
        table.columns[i].width = Inches(width)
    for r, row in enumerate(rows):
        for c, text in enumerate(row):
            header = r == 0
            fill = INK if header else (WHITE if r % 2 else CARD_ALT)
            color = WHITE if header else BODY
            paint_cell(table.cell(r, c), text, size, header, color, fill)
    return table


def notes(slide, text: str) -> None:
    slide.notes_slide.notes_text_frame.text = text


def chrome(slide, page: int, kicker: str, title: str, note: str):
    add_shape(slide, MSO_SHAPE.RECTANGLE, 0, 0, SLIDE_W, SLIDE_H, PAPER)
    add_shape(slide, MSO_SHAPE.RECTANGLE, 0, 0, 0.08, SLIDE_H, INK)
    add_text(slide, f"{page:02d}    {kicker}", 0.48, 0.26, 12.2, 0.3, 12, True, GOLD)
    add_text(slide, title, 0.46, 0.54, 12.4, 0.58, 28, True, INK)
    add_shape(slide, MSO_SHAPE.RECTANGLE, 0.48, 7.15, 12.38, 0.012, LINE)
    add_text(slide, "禾书耕文  ·  阶段汇报  ·  2026.09", 0.48, 7.18, 8.5, 0.26, 11, False, MUTED)
    add_text(slide, f"{page}  /  {TOTAL}", 10.4, 7.18, 2.4, 0.26, 11, False, MUTED, PP_ALIGN.RIGHT)
    notes(slide, note)
    return slide


def content_slide(prs, page, kicker, title, note):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    chrome(slide, page, kicker, title, note)
    return slide


def card(slide, x, y, w, h, fill=WHITE):
    shape = add_shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h, fill, LINE)
    try:
        shape.adjustments[0] = 0.08
    except Exception:
        pass
    return shape


def build() -> None:
    prs = Presentation()
    prs.slide_width = Inches(SLIDE_W)
    prs.slide_height = Inches(SLIDE_H)
    prs.core_properties.title = "禾书耕文：阶段汇报与下一期投入"
    prs.core_properties.subject = "2026-09-30 课题组汇报"
    prs.core_properties.author = "禾书耕文"

    cover(prs)
    agenda(prs)
    judgment(prs)
    market(prs)
    price(prs)
    wedge(prs)
    positioning(prs)
    phases(prs)
    foundations(prs)
    plagiarism(prs)
    library(prs)
    charts(prs)
    agent(prs)
    path(prs)
    errors(prs)
    case(prs)
    artifacts(prs)
    boundary(prs)
    next_phase(prs)
    difficulty(prs)
    support(prs)
    close(prs)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    prs.save(OUT)
    print(OUT)


def cover(prs) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_shape(slide, MSO_SHAPE.RECTANGLE, 0, 0, SLIDE_W, SLIDE_H, INK)
    add_shape(slide, MSO_SHAPE.RECTANGLE, 0, 0, 0.14, SLIDE_H, GOLD)
    add_text(slide, "阶段汇报  ·  2026.09.30", 0.7, 1.15, 10, 0.35, 14, True, GOLD)
    add_text(slide, "禾书耕文", 0.68, 1.7, 12, 1.15, 60, True, WHITE)
    add_text(slide, "实验室科研写作系统", 0.72, 2.95, 10, 0.5, 26, False, RGBColor(0xE4, 0xEB, 0xE6))
    add_shape(slide, MSO_SHAPE.RECTANGLE, 0.72, 3.65, 2.2, 0.035, GOLD)
    add_text(
        slide,
        "下一期买的是 1～2 篇真实初稿，和一张问题清单。\n不买新功能清单。做不到，就停开发费，只留服务器和接口。",
        0.72,
        4.0,
        10.5,
        1.15,
        18,
        False,
        RGBColor(0xF3, 0xF6, 0xF4),
    )
    add_text(slide, "汇报人 ________        听众：课题组导师 / 中心", 0.72, 6.55, 10, 0.35, 14, False, RGBColor(0xC5, 0xD2, 0xCA))
    notes(
        slide,
        "先把结论放在封面上。框架这期收口，下一笔钱用来打穿真实稿。全国其他实验室放在最后当后续，不放进这期验收。",
    )


def agenda(prs) -> None:
    slide = content_slide(
        prs,
        2,
        "目录",
        "今天讲六件事",
        "少讲内部代号。会上只用「以前怎样、现在怎样、下一笔换什么」。时间不够就留第 3、5、7、8、9、16、20、22 页。",
    )
    items = [
        ("01", "市场", "课题组已经在为什么付钱"),
        ("02", "定位", "三期怎么投，怎样算过"),
        ("03", "基础", "查重、知识库、图表、Agent"),
        ("04", "证明", "一条初稿路径，加一个真人例子"),
        ("05", "下一期", "改什么，卡在哪"),
        ("06", "拍板", "请老师定的人和钱"),
    ]
    for i, (num, name, desc) in enumerate(items):
        col = i % 2
        row = i // 2
        x = 0.5 + col * 6.35
        y = 1.55 + row * 1.7
        card(slide, x, y, 6.05, 1.5, WHITE)
        add_text(slide, num, x + 0.28, y + 0.32, 1.1, 0.7, 26, True, GOLD, anchor=MSO_ANCHOR.MIDDLE)
        add_text(slide, name, x + 1.5, y + 0.28, 4.2, 0.48, 22, True, INK)
        add_text(slide, desc, x + 1.5, y + 0.8, 4.2, 0.42, 15, False, MUTED)


def judgment(prs) -> None:
    slide = content_slide(
        prs,
        3,
        "阶段判断",
        "框架已经能出初稿",
        "从工具箱走到能走完一篇初稿的实验室系统。仓库约四百余次提交。近期主轴是每轮一个可见结果，蓝图和大纲都等人批准。",
    )
    add_text(
        slide,
        "从「功能齐全的写作工具箱」，走到「能走完一篇论文初稿的实验室系统」。",
        0.5,
        1.4,
        12.3,
        0.55,
        18,
        False,
        BODY,
    )
    steps = ["方向规划", "建项目", "分节写作", "审查 · 查重 · 配图", "Word / PDF"]
    gap = 0.16
    box_w = (12.3 - gap * 4) / 5
    for i, step in enumerate(steps):
        x = 0.5 + i * (box_w + gap)
        add_shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, x, 2.15, box_w, 0.85, INK if i == 4 else SOFT)
        add_text(
            slide,
            step,
            x + 0.08,
            2.28,
            box_w - 0.16,
            0.58,
            14,
            True,
            WHITE if i == 4 else INK,
            PP_ALIGN.CENTER,
            MSO_ANCHOR.MIDDLE,
        )
    labels = [
        ("安全", "稿不丢，页面和上传收紧，工作台以后好改"),
        ("真题", "指定人、指定题、指定截止日期，走出 1～2 篇初稿"),
        ("上限", "按问题清单改小功能，事先说好改多少"),
    ]
    for i, (title, desc) in enumerate(labels):
        x = 0.5 + i * 4.2
        card(slide, x, 3.4, 4.0, 2.35, WHITE)
        add_text(slide, f"0{i + 1}", x + 0.25, 3.58, 3.5, 0.4, 14, True, GOLD)
        add_text(slide, title, x + 0.25, 4.05, 3.5, 0.5, 22, True, INK)
        add_text(slide, desc, x + 0.25, 4.65, 3.5, 0.85, 15, False, BODY)


def market(prs) -> None:
    slide = content_slide(
        prs,
        4,
        "市场",
        "四类工具，各卖什么",
        "先承认别人强。我们只讲实验室这一摊：稿和数据留在组里。国内科研全家桶功能更多、品牌更大，不拿功能个数去比。",
    )
    add_table(
        slide,
        [
            ["类型", "代表", "课题组用它解决什么"],
            ["公网润色 / 投稿检查", "Paperpal", "英文语法、投稿前语言和引用检查"],
            ["公网文献助手", "SciSpace", "海量论文里检索、和 PDF 对话、写综述笔记"],
            ["综述 Agent", "Elicit", "筛文献、抽表格、做系统综述"],
            ["通用对话", "ChatGPT 等", "零门槛起草、改写、答疑"],
        ],
        0.5,
        1.5,
        12.3,
        4.15,
        [3.3, 2.6, 6.4],
        15,
    )
    card(slide, 0.5, 5.85, 12.3, 1.05, WARM)
    add_text(
        slide,
        "我们只讲自己占得住的缝：组内文献和实验数据进稿。不讲成「全面打过解螺旋」。",
        0.75,
        6.05,
        11.85,
        0.65,
        16,
        False,
        INK,
        anchor=MSO_ANCHOR.MIDDLE,
    )


def price(prs) -> None:
    slide = content_slide(
        prs,
        5,
        "价格",
        "和课题组已经在花的钱比",
        "公开标价，会上说大约，不要说成合同价。五人组一年公网订阅大约几千到一万出头。我们要的是同一量级的服务器、接口和陪跑。",
    )
    prices = [
        ("Paperpal", "约 144～348 美元 / 人 / 年", "Prime 到 Pro\n英文润色与投稿检查"),
        ("SciSpace", "年付约 12 美元 / 月", "Premium 约 144 美元 / 年\n文献任务重时更贵"),
        ("Elicit Pro", "约 49 美元 / 人 / 月", "按年付\n偏系统综述，比写作订阅贵"),
    ]
    for i, (name, price_line, desc) in enumerate(prices):
        x = 0.5 + i * 4.2
        card(slide, x, 1.45, 4.0, 2.35, WHITE)
        add_text(slide, name, x + 0.22, 1.6, 3.55, 0.4, 16, True, GOLD)
        add_text(slide, price_line, x + 0.22, 2.1, 3.55, 0.7, 18, True, INK)
        add_text(slide, desc, x + 0.22, 2.85, 3.55, 0.75, 14, False, MUTED)
    card(slide, 0.5, 4.0, 12.3, 1.35, WHITE)
    add_text(slide, "查重是另一笔反复开支", 0.75, 4.15, 11.8, 0.35, 15, True, INK)
    add_text(
        slide,
        "知网个人约 1.5 元/千字，AIGC 约 2 元/千字。硕士稿三万字一轮大约一百出头，改一版再测就是几百。终检不能省，能省的是还没改完就反复送正式库。",
        0.75,
        4.52,
        11.8,
        0.7,
        14,
        False,
        BODY,
    )
    card(slide, 0.5, 5.52, 12.3, 1.35, INK)
    add_text(
        slide,
        "五人组每人订一份 Paperpal 或 SciSpace，一年大约几千到一万出头人民币。\n文献和实验数据在对方云上，或者根本进不了稿。我们请的是同一量级的组内费用。",
        0.75,
        5.68,
        11.8,
        1.05,
        15,
        False,
        WHITE,
    )


def wedge(prs) -> None:
    slide = content_slide(
        prs,
        6,
        "差异",
        "我们占的那条缝",
        "公网订阅可以继续用来润色英文、查海量文献。禾书耕文补的是它们进不了组内数据和组内文库的那一段。",
    )
    points = [
        ("01", "资产留在组里", "组内 PDF、实验表、稿留在实验室服务器上。"),
        ("02", "引用有边界", "写作落到当前这一节，引用编号不得超出本次检索到的文献。"),
        ("03", "数字要对上", "结果章要接得上实验数据，不能凭对话编出数字。"),
        ("04", "农科写法在流程里", "IMRaD、结果与讨论分开，过度绝对的措辞会拦。"),
    ]
    for i, (num, title, desc) in enumerate(points):
        y = 1.45 + i * 1.3
        card(slide, 0.5, y, 12.3, 1.18, WHITE)
        add_shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 0.72, y + 0.28, 0.85, 0.62, SOFT)
        add_text(slide, num, 0.72, y + 0.32, 0.85, 0.54, 16, True, INK, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
        add_text(slide, title, 1.85, y + 0.16, 10.5, 0.4, 18, True, INK)
        add_text(slide, desc, 1.85, y + 0.58, 10.5, 0.42, 15, False, BODY)


def positioning(prs) -> None:
    slide = content_slide(
        prs,
        7,
        "定位",
        "作者主笔，系统出可审校初稿",
        "听到「一键出全文」就回到这页。三年到五年的终局是国内课题组都能私有部署。这期只说：先成为本实验室比直接开对话框更值得打开的工具。",
    )
    card(slide, 0.5, 1.45, 12.3, 1.35, INK)
    add_text(
        slide,
        "面向农业课题组的私有部署写作流程。\n作者主笔。系统给检索、分节草稿、证据、审查、配图，并导出 Word / PDF。",
        0.75,
        1.6,
        11.85,
        1.05,
        18,
        False,
        WHITE,
    )
    duties = [
        ("检索", "从组内文献里找依据"),
        ("起草", "按章节出草稿"),
        ("把关", "配图、审查、查重预检"),
        ("交稿", "导出给导师看的 Word / PDF"),
    ]
    for i, (title, desc) in enumerate(duties):
        x = 0.5 + i * 3.15
        card(slide, x, 3.05, 3.0, 1.85, WHITE)
        add_text(slide, title, x + 0.2, 3.25, 2.6, 0.5, 20, True, INK, PP_ALIGN.CENTER)
        add_text(slide, desc, x + 0.2, 3.9, 2.6, 0.7, 14, False, BODY, PP_ALIGN.CENTER)
    card(slide, 0.5, 5.15, 12.3, 1.7, WARM)
    add_text(slide, "人在关键步骤上", 0.75, 5.32, 11.8, 0.4, 16, True, GOLD)
    add_text(
        slide,
        "学生按阶段往下走。大纲、蓝图、每一轮写出来的结果，作者点头之后才进入下一步。",
        0.75,
        5.8,
        11.8,
        0.75,
        16,
        False,
        INK,
    )


def phases(prs) -> None:
    slide = content_slide(
        prs,
        8,
        "投资",
        "三期分开验收，过不了就停",
        "现在接近 A 的「系统能走完」，缺的是 A 的「人真的走完」。第二个实验室要等本实验室有人能独立走完再谈。第一篇真实稿出来之前，不开 LaTeX、基金标书、多实验室网站。",
    )
    add_table(
        slide,
        [
            ["期", "这期买到什么", "怎样算过"],
            ["A  本实验室打穿", "算力 + 陪跑", "1 篇真实初稿，有作者，导师看过"],
            ["B  组内能复制", "小额修改，按清单、有上限", "至少 3 人独立完成「文献 → 写一节 → 导出」"],
            ["C  对外试点", "第二个实验室", "对方自己导入文献并写出一节，附运维说明"],
        ],
        0.5,
        1.5,
        12.3,
        3.35,
        [3.1, 4.2, 5.0],
        15,
    )
    card(slide, 0.5, 5.1, 12.3, 1.75, WHITE)
    add_text(slide, "现在卡在 A 的后半句", 0.75, 5.28, 11.8, 0.4, 16, True, INK)
    add_text(
        slide,
        "工程上系统已经能走完。缺的是指定的人用真题走完。框架有了、细功能等使用再改，这个判断对。没有这篇稿，就不把「等反馈」当成继续开大功能的理由。",
        0.75,
        5.75,
        11.8,
        0.9,
        15,
        False,
        BODY,
    )


def foundations(prs) -> None:
    slide = content_slide(
        prs,
        9,
        "基础",
        "四件实验室原来就在做的事",
        "这四件都是课题组原来就要花钱或花时间的。系统把它们收进同一条写稿路径。后面四页各讲一件。",
    )
    add_table(
        slide,
        [
            ["事项", "以前", "现在"],
            ["查重", "按次付费，问题段自己找", "组内预检 + 降重定位，再决定送不送终检"],
            ["文献", "PDF 在个人电脑，人走库散", "组内库增量入库，写作时按章节检索"],
            ["图表", "Origin、Jade、PPT 来回切", "同一工作台出图、出表，进文稿"],
            ["上手", "按钮多，不知道先点哪", "跟 Agent 说下一步；关键步骤仍等人"],
        ],
        0.5,
        1.5,
        12.3,
        4.35,
        [1.8, 4.7, 5.8],
        15,
    )
    add_text(
        slide,
        "后面四页展开。每件只记一句：以前多痛，现在留在组里。",
        0.55,
        6.1,
        12.2,
        0.45,
        15,
        False,
        MUTED,
    )


def plagiarism(prs) -> None:
    slide = content_slide(
        prs,
        10,
        "查重",
        "少送几次正式库",
        "若被问能不能代替知网：不能代替终检，能少做几次无准备的付费检测。预检分数不能当成学校分数。",
    )
    left = [
        "初稿测、改完测、临近提交再测",
        "单次单价现在并不夸张",
        "贵在往返次数，以及还没定位问题段就送正式库",
    ]
    right = [
        "相似性预检，标出重复段落",
        "降重后并排看，再决定采纳",
        "和质量审查放在同一个入口",
    ]
    card(slide, 0.5, 1.45, 6.05, 3.55, WHITE)
    add_text(slide, "上学期的真实开支", 0.75, 1.65, 5.55, 0.4, 16, True, GOLD)
    add_lines(slide, [f"·  {line}" for line in left], 0.75, 2.2, 5.55, 2.5, 16, BODY, 12)
    card(slide, 6.75, 1.45, 6.05, 3.55, WHITE)
    add_text(slide, "系统里现在做的", 7.0, 1.65, 5.55, 0.4, 16, True, GOLD)
    add_lines(slide, [f"·  {line}" for line in right], 7.0, 2.2, 5.55, 2.5, 16, BODY, 12)
    card(slide, 0.5, 5.2, 12.3, 1.65, WARM)
    add_text(slide, "边界", 0.75, 5.38, 11.8, 0.35, 15, True, GOLD)
    add_text(
        slide,
        "预检用来减少正式库的往返。学校或期刊指定的知网 / 维普终检仍然要做。",
        0.75,
        5.85,
        11.8,
        0.7,
        16,
        False,
        INK,
    )


def library(prs) -> None:
    slide = content_slide(
        prs,
        11,
        "知识库",
        "文献从个人盘变成组里的增量库",
        "稿好不好，下一步主要看库新不新、方向全不全。中心提过的每方向约千篇，是文献工作目标，不是系统已经自动达成的数字。",
    )
    points = [
        ("留在组里", "私域 PDF 进组内索引。换届、换电脑，库不断。"),
        ("按章检索", "关键词加语义。写引言、方法、结果时，检索偏向不同。"),
        ("只处理新增", "新论文不必整库重做。题录可走 RIS / BibTeX，开放获取全文可入库。"),
        ("大约 900 篇", "历史上曾经到这个量级。之后靠各方向继续投喂，库才会新。"),
    ]
    for i, (title, desc) in enumerate(points):
        col = i % 2
        row = i // 2
        x = 0.5 + col * 6.35
        y = 1.5 + row * 2.5
        card(slide, x, y, 6.1, 2.3, WHITE)
        add_text(slide, title, x + 0.3, y + 0.3, 5.5, 0.5, 20, True, INK)
        add_text(slide, desc, x + 0.3, y + 1.0, 5.5, 0.95, 15, False, BODY)


def charts(prs) -> None:
    slide = content_slide(
        prs,
        12,
        "图表",
        "少切几次软件",
        "用「少切几次软件」来讲。覆盖的是本实验室常用科研图，特殊期刊的精细排版仍要作者收尾。",
    )
    add_text(
        slide,
        "以前：表格、Origin 或 Jade、PPT、分子网站，最后再贴回 Word。",
        0.55,
        1.4,
        12.2,
        0.45,
        16,
        False,
        MUTED,
    )
    kinds = [
        ("数据图", "柱状、折线、散点、热力"),
        ("表征与计算", "XRD、DFT"),
        ("三线表", "统计结果直接进文稿"),
        ("示意图", "流程、机理草图、分子结构"),
    ]
    for i, (title, desc) in enumerate(kinds):
        x = 0.5 + i * 3.15
        card(slide, x, 2.1, 3.0, 2.7, WHITE)
        add_shape(slide, MSO_SHAPE.RECTANGLE, x, 2.1, 3.0, 0.1, GOLD if i % 2 == 0 else INK)
        add_text(slide, title, x + 0.18, 2.45, 2.64, 0.7, 18, True, INK, PP_ALIGN.CENTER)
        add_text(slide, desc, x + 0.18, 3.3, 2.64, 1.15, 14, False, BODY, PP_ALIGN.CENTER)
    card(slide, 0.5, 5.1, 12.3, 1.75, SOFT)
    add_text(
        slide,
        "图在同一注册表里增加。写作和 Agent 可以调用，经过布局和质检后再进文稿。导出时带题注清单。",
        0.75,
        5.45,
        11.8,
        1.05,
        16,
        False,
        INK,
        anchor=MSO_ANCHOR.MIDDLE,
    )


def agent(prs) -> None:
    slide = content_slide(
        prs,
        13,
        "上手",
        "说下一步，关键步等人",
        "学习成本还在，但变了位置：不再先学十几个按钮，改为会改系统交出的那一节，并对数字和引用负责。Agent 省的是找功能的时间，省不了科研判断。",
    )
    cols = [
        ("以前", INK, WHITE, ["功能齐，路径像填题、点生成、导出", "作者参与少", "新人不知道该点哪个"]),
        ("现在", WHITE, INK, ["跟 Agent 说下一步", "系统去调文献、写节、作图、检查", "每一轮留下一个看得见的结果"]),
    ]
    for i, (title, fill, fg, lines) in enumerate(cols):
        x = 0.5 + i * 6.4
        card(slide, x, 1.45, 6.15, 3.35, fill)
        add_text(slide, title, x + 0.3, 1.65, 5.5, 0.45, 20, True, fg)
        add_lines(
            slide,
            [f"·  {line}" for line in lines],
            x + 0.3,
            2.3,
            5.5,
            2.2,
            16,
            fg if fill == INK else BODY,
            10,
        )
    card(slide, 0.5, 5.0, 12.3, 1.85, WARM)
    add_text(slide, "仍然等人点头的地方", 0.75, 5.18, 11.8, 0.4, 16, True, GOLD)
    add_text(
        slide,
        "大纲和蓝图必须批准。没有大纲会先问，不会直接往下写。导师确认过的方向是人机协作：人先写要点，系统再扩写。",
        0.75,
        5.65,
        11.8,
        0.9,
        16,
        False,
        INK,
    )


def path(prs) -> None:
    slide = content_slide(
        prs,
        14,
        "本阶段",
        "一条能走完的初稿路径",
        "这一页证明框架有了。下一页到案例页才证明人用过。两段要连着讲。写作是起草、核对、修改。引用越界会被去掉并告警。实验室机器记载约 4 核 / 8G。",
    )
    steps = [
        "1  方向或新建项目",
        "2  导入文献，确认配置",
        "3  大纲批准",
        "4  按节起草并质检",
        "5  实验数据进入结果",
        "6  图和表进文稿",
        "7  审查、查重、降重",
        "8  导出 Word / PDF",
    ]
    for i, step in enumerate(steps):
        col = i % 4
        row = i // 4
        x = 0.5 + col * 3.15
        y = 1.5 + row * 2.15
        fill = INK if i == 7 else WHITE
        fg = WHITE if i == 7 else INK
        card(slide, x, y, 3.0, 1.95, fill)
        add_text(slide, step, x + 0.2, y + 0.55, 2.6, 0.85, 16, True, fg, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)


def errors(prs) -> None:
    slide = content_slide(
        prs,
        15,
        "质量",
        "先拦住三类最费时间的错",
        "不保证句子漂亮。保证编造数字、乱引、结构串章会在交稿前被标出来。若案例稿上真有这类修改，就指给老师看。",
    )
    items = [
        ("乱引", "引用编号只能来自检索到的文献，越界会去掉并告警。"),
        ("编造数字", "精确数字要对上实验数据或文献，对不上就告警。"),
        ("结构串章", "结果和讨论分开写。章节之间做一致性检查。"),
    ]
    for i, (title, desc) in enumerate(items):
        y = 1.45 + i * 1.55
        card(slide, 0.5, y, 12.3, 1.4, WHITE)
        add_shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 0.75, y + 0.35, 2.15, 0.7, SOFT)
        add_text(slide, title, 0.75, y + 0.42, 2.15, 0.55, 16, True, INK, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
        add_text(slide, desc, 3.2, y + 0.38, 9.2, 0.65, 16, False, BODY, anchor=MSO_ANCHOR.MIDDLE)


def case(prs) -> None:
    slide = content_slide(
        prs,
        16,
        "案例",
        "用一篇真人初稿说话",
        "这是全场唯一的结果页，停久一点。周期指可审校初稿，终稿和投稿仍由作者完成。文件或日期对不上，就改口为下一篇指定题目开始计时，不要报不到一周。",
    )
    blocks = [
        ("人物", "易程学长\n同课题组，写过真实初稿"),
        ("以前", "1～2 个月\n一份能给导师看的初稿"),
        ("现在", "一周内\n拿出可审校初稿"),
    ]
    for i, (title, desc) in enumerate(blocks):
        x = 0.5 + i * 4.2
        card(slide, x, 1.45, 4.0, 2.15, INK if i == 2 else WHITE)
        add_text(slide, title, x + 0.25, 1.6, 3.5, 0.4, 14, True, GOLD if i == 2 else GOLD)
        add_text(slide, desc, x + 0.25, 2.15, 3.5, 1.15, 20 if i else 18, True, WHITE if i == 2 else INK)
    add_text(slide, "当场打开，并在会前填上", 0.55, 3.8, 12, 0.35, 14, True, MUTED)
    fields = ["论文题目（可脱敏）", "项目标识", "开始日期 / 交出日期", "改过的三处：数字、引用、结构"]
    for i, field in enumerate(fields):
        col = i % 2
        row = i // 2
        x = 0.5 + col * 6.35
        y = 4.25 + row * 1.2
        card(slide, x, y, 6.15, 1.05, WHITE)
        add_text(slide, field, x + 0.25, y + 0.15, 5.7, 0.3, 13, True, GOLD)
        add_text(slide, "______________________________", x + 0.25, y + 0.5, 5.7, 0.35, 14, False, MUTED)


def artifacts(prs) -> None:
    slide = content_slide(
        prs,
        17,
        "证据",
        "会上带三样实物",
        "老师觉得虚，是因为听到的是系统名词。这三样是结果。没有第 1 样，后两样也撑不住。人天估价放附录，不能单独当追加经费的理由。",
    )
    items = [
        ("1", "一份 Word 初稿", "脱敏或当场打开。易程那篇，或下一篇指定题。"),
        ("2", "一页过程记录", "用了哪些步骤、卡在哪、人工改了什么、接口大约花了多少。"),
        ("3", "一页对照", "ChatGPT、Paperpal、本系统各做哪一段。本系统不做什么，写在同一页。"),
    ]
    for i, (num, title, desc) in enumerate(items):
        y = 1.5 + i * 1.7
        card(slide, 0.5, y, 12.3, 1.55, WHITE)
        add_shape(slide, MSO_SHAPE.OVAL, 0.78, y + 0.4, 0.75, 0.75, INK)
        add_text(slide, num, 0.78, y + 0.5, 0.75, 0.55, 20, True, WHITE, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
        add_text(slide, title, 1.85, y + 0.25, 10.5, 0.45, 20, True, INK)
        add_text(slide, desc, 1.85, y + 0.8, 10.5, 0.5, 15, False, BODY)


def boundary(prs) -> None:
    slide = content_slide(
        prs,
        18,
        "边界",
        "做到的，和先写明的",
        "边界自己先说，比被问到再解释更像做过取舍。",
    )
    card(slide, 0.5, 1.45, 6.05, 5.35, SOFT)
    add_text(slide, "这期做到", 0.75, 1.65, 5.5, 0.45, 18, True, INK)
    add_lines(
        slide,
        [
            "·  私域检索、分节写作",
            "·  引用约束、审查和查重预检",
            "·  常用科研图",
            "·  Word / PDF",
            "·  关键步骤等人批准",
            "·  实验室可以部署试用",
        ],
        0.75,
        2.3,
        5.5,
        4.1,
        16,
        BODY,
        10,
    )
    card(slide, 6.75, 1.45, 6.05, 5.35, WHITE)
    add_text(slide, "不放进这期承诺", 7.0, 1.65, 5.5, 0.45, 18, True, GOLD)
    add_lines(
        slide,
        [
            "·  无人值守、可直接投稿的全文",
            "·  期刊级精排、稳定的 LaTeX",
            "·  二十人同时写、全年无运维",
            "·  替代知网终检",
            "·  生信平台或基金标书系统",
            "·  再做一套站点，或推倒重写",
        ],
        7.0,
        2.3,
        5.5,
        4.1,
        16,
        BODY,
        10,
    )


def next_phase(prs) -> None:
    slide = content_slide(
        prs,
        19,
        "下一阶段",
        "4 到 8 周：先打穿真题",
        "会上工程项用一句带过：安全、不丢稿、以后好改。时间留给真题怎么组织。LaTeX 没有老师拍板之前不开。",
    )
    card(slide, 0.5, 1.45, 7.55, 5.35, WHITE)
    add_text(slide, "主轴：试用", 0.75, 1.65, 7.1, 0.4, 16, True, GOLD)
    add_lines(
        slide,
        [
            "·  选 1～2 个方向，各 1 篇真题",
            "·  空项目 → 文献 → 大纲批准 → 写节",
            "·  图 / 表 → 质量中心 → 导出",
            "·  回收反馈：质量、速度、卡点、敢不敢用于投稿前自查",
            "·  只按清单改小处，事先说好上限",
            "·  空白问卷不能代替这次试用",
        ],
        0.75,
        2.25,
        7.05,
        4.2,
        15,
        BODY,
        8,
    )
    card(slide, 8.25, 1.45, 4.55, 5.35, INK)
    add_text(slide, "同时做的工程", 8.5, 1.65, 4.1, 0.45, 16, True, GOLD)
    add_lines(
        slide,
        [
            "页面内容消毒",
            "中断时后台也能停",
            "作图和上传收紧",
            "建项和自动保存不丢",
            "工作台编排下沉",
        ],
        8.5,
        2.35,
        4.05,
        3.6,
        15,
        WHITE,
        12,
    )


def difficulty(prs) -> None:
    slide = content_slide(
        prs,
        20,
        "难点",
        "主因是没有截止日期",
        "组员学不会和不急着写要分开说。先讲截止日期，再讲学习成本。没有指定题目和交稿日，按使用迭代就是空转。",
    )
    card(slide, 0.5, 1.45, 8.15, 5.35, WHITE)
    add_text(slide, "主因", 0.75, 1.62, 7.6, 0.35, 14, True, GOLD)
    add_text(slide, "没有「不写不行」的任务", 0.75, 2.05, 7.6, 0.5, 20, True, INK)
    add_text(
        slide,
        "学习成本是真的，但任何写作工具在没有节点时都是选修课。下一阶段先绑到已有任务：",
        0.75,
        2.65,
        7.6,
        0.85,
        15,
        False,
        BODY,
    )
    add_lines(
        slide,
        [
            "·  开题或中期必须交的综述一章",
            "·  基金本子里的已有工作，改写成引言",
            "·  老师指定：一组数据，两周内只走工作台，出结果节骨架",
        ],
        0.75,
        3.6,
        7.6,
        2.6,
        15,
        BODY,
        8,
    )
    card(slide, 8.85, 1.45, 3.95, 5.35, WARM)
    add_text(slide, "次因", 9.1, 1.65, 3.5, 0.35, 14, True, GOLD)
    add_lines(
        slide,
        [
            "·  新人仍要会改稿，预检不是终检",
            "·  人多时 4 核 8G 容易变慢",
            "·  库不再入库，检索就会旧",
            "·  开发仍是一人，瓶颈在试用",
        ],
        9.1,
        2.25,
        3.5,
        4.1,
        14,
        BODY,
        12,
    )


def support(prs) -> None:
    slide = content_slide(
        prs,
        21,
        "支持",
        "请老师定的九件事",
        "钱的结构是接口和机器，加上陪跑，加上很小一笔按清单修改。没有真实稿之前，不请大额开发费。",
    )
    add_table(
        slide,
        [
            ["请定", "具体", "换到什么"],
            ["方向", "作者主笔，Agent 为日常入口", "验收看可审校初稿"],
            ["试用", "2～5 人，自带题目和文献，2～4 周", "至少 1 篇初稿您过目"],
            ["任务", "绑到开题、中期或两周结果节", "截止日前有人打开"],
            ["算力", "DeepSeek 与智谱额度；认可限流", "多人同时写不被打穿"],
            ["服务器", "扩大再升配；备份指定到人", "8G 只够现在的规模"],
            ["文献", "各方向继续入库，写明使用范围", "库决定稿的质量"],
            ["口径", "AI 稿必须人工审校，引用作者负责", "和答辩、伦理一致"],
            ["LaTeX", "这期要，或不要", "决定开不开这一项"],
            ["人力", "文献整理或运维兼职即可", "不强制第二名开发"],
        ],
        0.42,
        1.32,
        12.5,
        5.55,
        [1.7, 5.5, 5.3],
        12,
    )


def close(prs) -> None:
    slide = content_slide(
        prs,
        22,
        "拍板",
        "请当场定的四件事",
        "讲完停在这四件事上。老师不拍板第 1 件，后面三件都可以下次再说。",
    )
    items = [
        ("1", "哪一篇", "下一篇计时的题目、作者、您哪一天看初稿。"),
        ("2", "还有谁", "2～4 周里，谁必须走完「文献 → 写一节 → 导出」。"),
        ("3", "额度", "模型按现有规模维持，还是按 5 人同时试用上调。"),
        ("4", "LaTeX", "这期不做。若要做，另开一次，先定期刊模板。"),
    ]
    for i, (num, title, desc) in enumerate(items):
        col = i % 2
        row = i // 2
        x = 0.5 + col * 6.35
        y = 1.45 + row * 1.85
        card(slide, x, y, 6.15, 1.7, WHITE)
        add_text(slide, num, x + 0.25, y + 0.4, 0.6, 0.8, 28, True, GOLD, anchor=MSO_ANCHOR.MIDDLE)
        add_text(slide, title, x + 1.0, y + 0.25, 4.85, 0.45, 18, True, INK)
        add_text(slide, desc, x + 1.0, y + 0.8, 4.85, 0.65, 14, False, BODY)
    add_text(
        slide,
        "这期能出可审校初稿。请用一篇真题验收。通过之后，再谈第二个人，以及要不要给合作组试点。",
        0.55,
        5.3,
        12.2,
        0.7,
        16,
        True,
        INK,
    )
    add_text(
        slide,
        "其他实验室，是这条路走通之后的事。",
        0.55,
        6.05,
        12.2,
        0.45,
        16,
        False,
        MUTED,
    )


if __name__ == "__main__":
    build()
