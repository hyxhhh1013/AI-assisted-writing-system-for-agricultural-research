# -*- coding: utf-8 -*-
"""课题组阶段汇报 Word。按 2026-09-30 讨论成文，不沿用此前阶段性总结稿的结构。"""
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor, Twips

HERE = Path(__file__).resolve().parent
OUT = HERE / "禾书耕文-阶段汇报与下一期投入.docx"

NAVY = RGBColor(0x1B, 0x3A, 0x4B)
BODY = RGBColor(0x1A, 0x1A, 0x1A)
MUTED = RGBColor(0x55, 0x55, 0x55)


def set_run_font(run, name_cn="宋体", name_en="Times New Roman", size=12, bold=False, color=None):
    run.bold = bold
    run.font.size = Pt(size)
    run.font.name = name_en
    run.font.color.rgb = color or BODY
    rPr = run._element.get_or_add_rPr()
    ea = rPr.find(qn("w:eastAsia"))
    if ea is None:
        ea = rPr.makeelement(qn("w:eastAsia"), {})
        rPr.append(ea)
    ea.set(qn("w:val"), name_cn)


def _p_format(p, *, before=0, after=6, line=1.25, indent=0, align="left"):
    pf = p.paragraph_format
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    pf.line_spacing = line
    pf.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
    pf.first_line_indent = Cm(indent)
    if align == "center":
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    elif align == "right":
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    else:
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT


def add_p(doc, text, *, size=12, bold=False, before=0, after=6, indent=0, align="left", name_cn="宋体", color=None):
    p = doc.add_paragraph()
    _p_format(p, before=before, after=after, indent=indent, align=align)
    run = p.add_run(text)
    set_run_font(run, name_cn=name_cn, size=size, bold=bold, color=color)
    return p


def heading(doc, text):
    p = doc.add_paragraph()
    _p_format(p, before=16, after=8, line=1.15)
    run = p.add_run(text)
    set_run_font(run, name_cn="黑体", size=14, bold=True, color=NAVY)
    pPr = p._p.get_or_add_pPr()
    pbdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "6")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), "1B3A4B")
    pbdr.append(bottom)
    pPr.append(pbdr)
    return p


def shade_cell(cell, fill):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd = tcPr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tcPr.append(shd)
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, dxa=80):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    mar = tcPr.find(qn("w:tcMar"))
    if mar is None:
        mar = OxmlElement("w:tcMar")
        tcPr.append(mar)
    for edge in ("top", "left", "bottom", "right"):
        node = mar.find(qn(f"w:{edge}"))
        if node is None:
            node = OxmlElement(f"w:{edge}")
            mar.append(node)
        node.set(qn("w:w"), str(dxa))
        node.set(qn("w:type"), "dxa")


def set_table_borders(table, color="B7C3CE", sz="4"):
    tbl = table._tbl
    tblPr = tbl.tblPr
    borders = tblPr.find(qn("w:tblBorders"))
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tblPr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = borders.find(qn(f"w:{edge}"))
        if el is None:
            el = OxmlElement(f"w:{edge}")
            borders.append(el)
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), sz)
        el.set(qn("w:space"), "0")
        el.set(qn("w:color"), color)


def set_table_widths(table, widths):
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    tbl = table._tbl
    tblPr = tbl.tblPr
    total = int(sum(widths) * 567)
    tblW = tblPr.find(qn("w:tblW"))
    if tblW is None:
        tblW = OxmlElement("w:tblW")
        tblPr.append(tblW)
    tblW.set(qn("w:w"), str(total))
    tblW.set(qn("w:type"), "dxa")
    layout = tblPr.find(qn("w:tblLayout"))
    if layout is None:
        layout = OxmlElement("w:tblLayout")
        tblPr.append(layout)
    layout.set(qn("w:type"), "fixed")
    grid = tbl.find(qn("w:tblGrid"))
    if grid is not None:
        for child in list(grid):
            grid.remove(child)
    else:
        grid = OxmlElement("w:tblGrid")
        tblPr.addnext(grid)
    for w in widths:
        gc = OxmlElement("w:gridCol")
        gc.set(qn("w:w"), str(int(w * 567)))
        grid.append(gc)
    for row in table.rows:
        tr = row._tr
        trPr = tr.get_or_add_trPr()
        cant = trPr.find(qn("w:cantSplit"))
        if cant is None:
            trPr.append(OxmlElement("w:cantSplit"))
        for i, cell in enumerate(row.cells):
            tc = cell._tc
            tcPr = tc.get_or_add_tcPr()
            tcW = tcPr.find(qn("w:tcW"))
            if tcW is None:
                tcW = OxmlElement("w:tcW")
                tcPr.append(tcW)
            tcW.set(qn("w:w"), str(int(widths[i] * 567)))
            tcW.set(qn("w:type"), "dxa")
            cell.width = Cm(widths[i])


def write_cell(cell, text, *, bold=False, size=10.5, color=None, fill=None, center=False):
    cell.text = ""
    if fill:
        shade_cell(cell, fill)
    set_cell_margins(cell)
    lines = text.split("\n")
    for i, line in enumerate(lines):
        p = cell.paragraphs[0] if i == 0 else cell.add_paragraph()
        _p_format(p, before=0, after=1, line=1.12, align="center" if center else "left")
        run = p.add_run(line)
        set_run_font(run, size=size, bold=bold, color=color or BODY)


def add_table(doc, headers, rows, widths):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    set_table_borders(table)
    set_table_widths(table, widths)
    for i, h in enumerate(headers):
        write_cell(table.rows[0].cells[i], h, bold=True, size=10.5, fill="E6EEF4", center=True)
    for r, row in enumerate(rows):
        fill = "F7F9FB" if r % 2 else "FFFFFF"
        for c, val in enumerate(row):
            write_cell(table.rows[r + 1].cells[c], val, size=10.5, fill=fill)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return table


def callout(doc, title, lines):
    table = doc.add_table(rows=1, cols=1)
    set_table_borders(table, color="C4A574", sz="8")
    set_table_widths(table, [16.2])
    cell = table.cell(0, 0)
    shade_cell(cell, "FBF6EE")
    set_cell_margins(cell, 120)
    cell.text = ""
    p = cell.paragraphs[0]
    _p_format(p, before=0, after=4, line=1.15)
    run = p.add_run(title)
    set_run_font(run, name_cn="黑体", size=12, bold=True, color=NAVY)
    for i, line in enumerate(lines, start=1):
        p = cell.add_paragraph()
        _p_format(p, before=2, after=2, line=1.2)
        run = p.add_run(f"{i}. {line}")
        set_run_font(run, size=12)
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(4)


def footer_header(section):
    header = section.header
    header.is_linked_to_previous = False
    hp = header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = hp.add_run("禾书耕文 · 课题组阶段汇报")
    set_run_font(run, name_cn="楷体", size=9, color=MUTED)
    footer = section.footer
    footer.is_linked_to_previous = False
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r1 = fp.add_run("内部材料  ·  成文 2026-09-30  ·  事实截至 2026-09-23  ·  第 ")
    set_run_font(r1, size=9, color=MUTED)
    run = fp.add_run()
    set_run_font(run, size=9, color=MUTED)
    fld1 = OxmlElement("w:fldChar")
    fld1.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    fld2 = OxmlElement("w:fldChar")
    fld2.set(qn("w:fldCharType"), "end")
    run._r.append(fld1)
    run._r.append(instr)
    run._r.append(fld2)
    r2 = fp.add_run(" 页")
    set_run_font(r2, size=9, color=MUTED)


def main():
    doc = Document()
    sec = doc.sections[0]
    sec.page_width = Cm(21.0)
    sec.page_height = Cm(29.7)
    sec.top_margin = Cm(2.2)
    sec.bottom_margin = Cm(2.0)
    sec.left_margin = Cm(2.3)
    sec.right_margin = Cm(2.3)
    sec.header_distance = Cm(0.8)
    sec.footer_distance = Cm(0.6)
    footer_header(sec)

    style = doc.styles["Normal"]
    style.font.name = "Times New Roman"
    style.font.size = Pt(12)
    style.element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")

    add_p(doc, "禾书耕文（GrainScript）", size=22, bold=True, align="center", name_cn="黑体", color=NAVY, after=2)
    add_p(doc, "阶段汇报与下一期投入说明", size=16, bold=True, align="center", name_cn="黑体", after=8)
    add_p(
        doc,
        "供课题组导师阅。用来决定要不要继续投、投在哪、怎样算交账。",
        size=11,
        align="center",
        color=MUTED,
        after=2,
    )
    add_p(doc, "汇报人：______________　　日期：2026 年 9 月 30 日", size=11, align="center", after=10)

    callout(
        doc,
        "请老师在这次会上定三件事",
        [
            "指定一篇必须写出来的稿，并给出大致截止时间。可以是初稿，但要有作者，并且老师看过其中一节。",
            "指定两到三名必须试用的人。其中要有正在写这篇稿的人，不能只派「有空再看看」的人。",
            "批准一笔小额经费，主要花在模型调用、现有服务器和盯这篇稿上。交账标准是这篇稿，加上一页「用了哪几步、卡在哪、人改了什么」。面向其他实验室，不写进这笔钱的验收。",
        ],
    )

    add_p(
        doc,
        "可以这样开口：老师，系统已经能在实验室服务器上，把一篇论文从进文献、出大纲、写一节、查引用、做审查和查重，走到导出 Word。我今天不是来报功能清单，是来请您把下一阶段收成一件能交账的事：指定稿、指定人、批一笔主要用于算力的小钱。这笔钱买到的是「本组有一篇真稿走过这套流程」。其他课题组以后能不能用，等这件事做通再谈。",
        size=12,
        name_cn="楷体",
        after=4,
    )

    heading(doc, "一、现在这个项目处在什么位置")
    add_p(
        doc,
        "禾书耕文是给农业科研课题组用的写作辅助系统。文献和实验数据放在组里，作者自己定题目、改大纲、改每一节。系统负责在组内文献里找依据、按节起草、拦住越界的引用编号、做审查和查重、把实验表和科研图收进稿里，并导出 Word 或 PDF。作者对数据、引用和是否投稿负责。",
    )
    add_p(
        doc,
        "从 2026 年 5 月到 9 月 23 日，仓库主线累计 414 次提交。最近一次主线提交是「每轮只给一个看得见的结果，大纲和论证蓝图都要人批准」。工程上，一篇论文从建项到导出的路径已经接上。还没有接上的，是某一篇真实课题用它少返工、并且老师愿意把那一节当成正式初稿来看。",
    )
    add_p(
        doc,
        "所以下一阶段的主业，是让本组打穿这一篇。框架上的细功能，按这篇稿实际卡住的地方改。在这篇稿出现之前，不再以「等大家用起来再看」为理由去开大功能。没有指定课题，就不会有使用，开发会空转。",
    )

    heading(doc, "二、最终要做成什么，中间分几期")
    add_p(
        doc,
        "三年到五年后可以说的终局，是一套给国内课题组私有部署的科研写作流程：文献在组里，数据在组里，稿在组里；系统只在作者点头的步骤上起草和检查；交出去的是可以审校的初稿。公网上那种打开对话框就出整篇、数据也跟着送出去的用法，不在这个终局里。",
    )
    add_p(
        doc,
        "从本实验室走到「别的课题组也能用」，中间有两道门。第一道门是本组有一篇真稿走完。第二道门是组里另一个人不靠手把手，也能自己走完「导入文献、写一节、导出」。两道门都过了，才有资格拿着部署说明去同一个学院或合作组试装一套。全国农科、材料等课题组数量大、英文写作压力大、数据又不适合放公网，这是终局里的机会，是第三期以后的故事。它不能当作下一笔经费的交账标准。",
    )
    add_p(doc, "对外只讲三期。每一期写明买什么、交什么、交不出就停。工程内部的安全修补和工作台整理，是试用时别中途坏掉的维护，不单独当成一期产品。", after=8)

    add_table(
        doc,
        ["期", "这一期买的东西", "怎样算过关", "过不了"],
        [
            [
                "第一期\n本组打穿一篇",
                "模型额度、现有服务器、指定一篇稿的陪跑。按这篇稿暴露的问题做小改，改动有上限。",
                "一篇带作者的初稿，老师看过至少一节。另附一页记录：走了哪些步骤、卡在哪、人工改了哪一类问题。记下这段时间的接口花费和中断次数。",
                "停下一笔开发费用。服务器可以留着，也可以关。不因为「已经做了很多」自动进入第二期。",
            ],
            [
                "第二期\n组里能复制",
                "只改第一期问题清单上的条目。预算事先封顶。",
                "至少三名组员，各自独立完成「文献进库 → 写一节 → 导出」。记下每个人卡在哪。",
                "不谈第二个实验室，也不把系统说成可以对外推广。",
            ],
            [
                "第三期\n合作组试点",
                "一份能让对方自己装起来的简要说明，以及一次白名单部署。",
                "对方实验室自己导入文献，并写出一节。出了故障有人能按说明处理，不依赖每天远程代操作。",
                "全国其他课题组仍只作为之后的选项，不在第三期里承诺铺开。",
            ],
        ],
        [2.5, 4.3, 5.0, 4.4],
    )
    add_p(
        doc,
        "和通用对话、和商业润色工具的差别，会上只讲三句，不比功能条数：文献和实验数据留在组里；大纲、蓝图和每一轮结果都等人批准；农科论文的结构、过度声称和引用越界，写进检查规则里。",
        size=10.5,
        color=MUTED,
        after=4,
    )

    heading(doc, "三、前期做完了什么")
    add_p(doc, "下面按老师可能问的「这几个月到底在干什么」来排。时间是大约的区间，以仓库提交为准。", after=8)
    add_table(
        doc,
        ["时段", "当时在做的事"],
        [
            ["2026 年 5 月", "登录与项目、分节写作、图表与 XRD、文献对话、农学写作要求，以及服务器上的第一次部署。"],
            ["5 月末至 6 月初", "换上 PostgreSQL，文献索引改成可加载的形式，补路径安全、限流、后台管理和用量记录，把查重、审查接到可用状态。"],
            ["6 月", "产品方向从「填题后一次生成」改为作者先给要点和大纲，审查改为清单。该方案经过导师确认。"],
            ["6 月至 7 月", "文献列表补期刊与影响因子，接入外部检索、RIS/BibTeX 和开放获取全文；研究方向与写作项目互相衔接。"],
            ["7 月", "把一篇论文收成可跟着走的阶段：项目阶段状态、工作台提示下一步、写作助手调用工具、引用硬检、审查轮次、导出前检查。"],
            ["7 月末至 9 月 23 日", "写作与图表的质量检查、实验数据进入结果章的门禁、附件与表格、质量查看页、文献增量索引。关键步骤改为每轮一个可见结果，等人批准再继续。"],
        ],
        [3.6, 12.6],
    )
    add_p(doc, "老师如果要看「现在打开系统能做什么」，对应关系如下。", after=8)
    add_table(
        doc,
        ["已经能完成的事", "仍不能当作承诺"],
        [
            ["组内 PDF 检索后，按章节起草。写作走起草、核查、修改。", "打开后无人值守，直接交出可投稿全文。"],
            ["引用编号限制在本论文的文献池内；对不上文献时告警。", "替作者保证每条引文的学术判断都正确。"],
            ["查重与降重、四方面审查、跨章节一致性、提交前的质量查看。", "替代期刊编辑部或学校查重系统的正式结论。"],
            ["科研图、XRD 等，以及实验表进入结果章。结果章没有对应数据时，不写入新的精确数字。", "达到某本期刊的精细排版，或提供稳定的 LaTeX 模板。"],
            ["Word 与 PDF 导出前做同一套就绪检查；可带双语摘要和图表题注清单。", "商业产品那种开箱即用的界面完成度。"],
            ["实验室账号、用量记录，可在现有服务器上部署试用。", "二十人同时写作，或全年不需要人看管。"],
        ],
        [8.1, 8.1],
    )
    add_p(
        doc,
        "知识库是私域 PDF 索引，检索用关键词与向量结合，并按论文结构切块，支持增量更新，也可以纳入外部文献和开放获取全文。早期介绍材料里写过约九百篇的量级。本次汇报不把这个数字当成当前库存审计结果，库大不大以组里实际入库为准。写作质量首先取决于库里有没有这篇稿要用的文献，其次才是再换一次模型。",
    )
    add_p(
        doc,
        "文档上留有总体规划、接口与数据说明、工程任务队列、周报，以及一份用户问卷模板。问卷还没有回收统计，不能写成「用户满意度已经调查过」。智慧农业创新中心曾要求各方向把文献入库，并用本系统辅助写一篇。系统侧具备从导入到查重的路径；各方向是否交稿，不在本仓库里。",
    )

    heading(doc, "四、为什么这些还不足以支持继续加钱")
    add_p(
        doc,
        "2026 年 6 月 1 日做过一次工作量对照，写在《项目工作量与价值评估》里。口径是大陆软件外包的人天乘单价，不是审计价，也不是学校已经支付的金额。当时已完成部分约 180 至 220 人天，建议对外说明取 25 万至 40 万元，向导师口头说明可取约 30 万元作中位。7 月到 9 月的写作助手、质量检查和图表质检没有算进这张表，实际投入高于该日快照。",
    )
    add_p(
        doc,
        "同一份文件里还有一张「收尾经费」示例，合计 8 万至 15 万元，科目是开发收尾、一年云服务与接口、试用迭代，目标写成「达到可对外稳定服务」。那张表的基准日是 6 月 1 日，表中若干「还不能构建和部署」的项目，后来已经做过一轮。现在若把 8 万至 15 万原样拿来申请，买的仍是开发收尾和对外服务，和今天缺的东西对不上。",
    )
    add_p(
        doc,
        "代码、提交次数和人天，说明前期没有闲着。它们证明不了下一笔值得批。老师作为这一期的出资方，要看到的是结果：某位同学用系统写了引言或结果，老师改的时候，比直接用通用对话少碰到哪一类错，例如编造数字、引用对不上、结构散；这段时间接口花了多少钱、中断了几次；有没有人用完一次之后还愿意再打开。留存比功能列表硬。",
    )
    add_p(doc, "因此第一期最少要留下三样东西：一篇可脱敏的真实稿和导出的 Word；一页步骤、卡点与人工修改记录；一张和外面产品的对照，以及我们明确不承接的范围。没有这三样，第二期没有依据。", after=4)

    heading(doc, "五、试用里实际发生过什么")
    add_p(
        doc,
        "系统在实验室服务器上试跑过。部署文档里的机器基线是 4 核、8GB 内存，进程按单实例运行，并设了内存上限，为的是两三人同时扩写时尽量不把整机拖垮。没有成套的问卷回收。下表来自试运行和开发中已经记下的问题，不是满意度统计。",
        after=8,
    )
    add_table(
        doc,
        ["方面", "当时的情况", "已经做过的处理"],
        [
            ["同时使用", "多人一起扩写变慢，偶发中断或接口报错；数据库、文献目录、密钥配错时很难查。", "限流、默认轻量、超时与进程崩溃相关修复、部署前检查、单实例与内存上限。"],
            ["使用路径", "完整点下来像填题、生成、导出，作者参与少。", "改为先有要点和大纲，审查清单化，关键步骤等人批准。"],
            ["文献", "希望列表里直接看到期刊和影响因子，并接到外部文献。", "列展示、影响因子与分区、外部检索、RIS/BibTeX、开放获取入库。"],
            ["写作助手", "写完缺少反馈并跳到不相干的页；改引用改不收尾；库里没有的文献被反复检索卡住；表格上传后出现 0 字或解析失败。", "运行中显示工具状态、引用修正改为可收束、缺文献时仍继续写本节、调整附件提取并兼容表格文件。"],
        ],
        [2.6, 6.8, 6.8],
    )
    add_p(
        doc,
        "这些记录说明：关着门加功能，不如拿一篇真稿接着改。问卷如果以后收，同学仍可能集中提到写作质量波动、库不够新、不知道从哪一步开始、高峰时变慢。这四项要用真实稿来计数，不能用空白问卷代替。",
    )

    heading(doc, "六、组里推不动，主要卡在哪")
    add_p(
        doc,
        "有两件同时存在的事。一件是学习成本：入口一多，同学不愿意先学一套软件。另一件是写论文在组里常常不紧迫，不到截止日，意愿不高。两件里，起决定作用的是第二件。没有「不写不行」的任务时，任何写作工具都是选修课。同学的理性选择是截止日前再熬夜，平时不学新系统。培训手册盖不住这件事。",
    )
    add_p(
        doc,
        "所以第一期要把系统和已经存在的截止日绑在一起，由老师指定其中一件：毕业开题或中期必须交的综述里的一章；某份基金里「已有工作」改写成论文引言；或明确说「这组数据两周内出结果节骨架，只用工作台里的写作助手路径」。没有指定题目和日期，反馈不会来。",
    )
    add_p(
        doc,
        "学习成本压到一次大约 45 分钟，只教五步：建项目，上传三篇 PDF 或一个表，批准大纲，写一节，导出。其余入口收在专家工具里，试用的同学不需要看见。谁在这五步里走不通，先改入口，不先归因于同学不努力。",
    )

    heading(doc, "七、外面已有的产品，我们占哪一席")
    add_p(
        doc,
        "下面按类别对照，价格是各产品公开页面在 2026 年前后的粗算，用来给经费一个锚点，不是询价，也不是尽职调查。国内部分商业产品不公示报价，这里不编数字。我们只说明自己对应其中一种实验室场景，不去和对方比用户量或功能个数。",
        after=8,
    )
    add_table(
        doc,
        ["类别", "常见产品", "他们强的地方", "我们在会上讲的那一席"],
        [
            ["公网学术写作与润色", "Paperpal、SciSpace 等", "英文润色、投稿检查、公网文献。个人年费大约在一百美元上下这个量级。", "组内 PDF 和实验表进稿，文献与未发表数据留在实验室服务器。"],
            ["文献综述助手", "Elicit 等", "筛论文、抽表格、做系统综述。席位常见为每人每月数十美元量级。", "落到本论文的某一节，并带引用检查。交付的是章节草稿，不是阅读笔记。"],
            ["国内科研工具平台", "解螺旋等", "工具多、有运营、覆盖生信和标书，公司做了多年。", "农业写作场景、私有部署、每步等人批准。不做成另一个全家桶。"],
            ["通用对话", "ChatGPT 及国产对话", "打开就能用，没有学习成本。", "有项目、有文献池、引用不能随便编号、结果章受实验数据约束。"],
        ],
        [3.2, 3.2, 4.8, 5.0],
    )
    add_p(
        doc,
        "一个五人课题组如果已经在为公网学术工具付费，按公开标价粗算，一年大约是几千元到一两万元人民币，而且组内 PDF 和未发表数据要么送进公网，要么不送进去就用不好。第一期要的钱，和这笔「组里本来可能花掉的订阅」是同一个数量级：服务器加模型调用，再加盯一篇稿的时间。换来的是文献和数据留在组里。这是和课题组已有开支比，不是和上市公司的估值比。",
    )
    add_p(
        doc,
        "本期明确不承接、会上也不要被加进验收的事项：一键生成可发表全文；生信分析平台；基金标书流水线；再做一个独立的可视化站点；把现有写作流程换成另一套通用框架重写。LaTeX 是否要做，见文末，由老师单独勾选。不勾选就保持关闭。",
    )

    heading(doc, "八、若批准第一期，这 4 至 8 周做什么")
    add_p(doc, "时间首先给这篇稿，顺序固定为：空项目，文献入库，大纲经作者批准，写一节，图或表进入稿，质量查看，导出 Word。陪跑的人记录每一步是否走通。", )
    add_p(doc, "只有挡住这篇稿的问题才改。事先已经列在工程队列、属于「试用时别写坏、别中断」的维护，可以插在陪跑间隙做完，不另立项目：页面插入内容的消毒、写作途中取消时后台跟着停、上传和绘图子进程的超时与清理、新建项目与自动保存避免覆盖、工作台里过重的编排移出页面。绘图相关改动做完后要跑图表测试。文献索引的保存方式，开工前先定是全量替换还是增量更新，避免改到一半语义不清。", )
    add_p(doc, "稿走完之后，向试用的人收一页反馈，只问四件事：这一节的质量是否够给老师看，速度能否忍受，卡在哪一步，是否敢用它做投稿前的自查。", )
    add_p(doc, "LaTeX 仍然关闭。要开的话，老师需要先定三句：要的是源文件还是编译好的 PDF，给哪几本期刊的模板，和 Word 哪一个是组里的主格式。这三句不定，这一项不进入第一期。", )

    heading(doc, "九、经费与其他支持")
    add_p(
        doc,
        "6 月评估里，轻度使用的月运行费大约是几百元到四千元，含服务器、模型接口和备份，对象是大约五到二十人。那是数量级，实际以账单为准。第一期若只服务一篇稿和两三名试用者，现有 4 核 8GB 可以先不升配；一旦扩大到多人同时写，内存容易顶满，升配另列，不混进这笔小额里。",
        after=8,
    )
    add_table(
        doc,
        ["科目", "建议额度", "说明"],
        [
            ["模型调用\n2～4 周", "0.3～1.2 万元", "写作用 DeepSeek，核查用智谱。按账单报销，并设一个月上限，避免高峰把额度打穿。"],
            ["服务器与备份", "0.1～0.4 万元", "维持现有机器。扩大试用或要人值守备份时，另写一笔，并指定备份责任人。"],
            ["盯这篇稿", "含在一期总额内", "陪跑、记录卡点、只改挡住稿子的问题。不按「把全国产品做完」计价。"],
            ["第一期合计", "建议先批 1～3 万元", "写进任务书：交稿和问题清单之后，再决定有没有第二期。第二期预算到时候按问题清单封顶，不在今天预支。"],
        ],
        [3.4, 3.6, 9.2],
    )
    add_p(doc, "比金额更要紧的组织条件如下。缺任何一条，钱批了也推不动。", after=8)
    add_table(
        doc,
        ["需要老师定的", "具体内容", "不定会怎样"],
        [
            ["方向", "继续按「作者主笔、系统辅助」验收。写作助手是组员的主入口。", "若改回「一键出全文」，现有设计和学术口径都会对不上。"],
            ["任务", "一篇稿、一个日期、两到三名必须用的人。", "系统保持选修课，反馈不会出现。"],
            ["算力", "认可 DeepSeek 与智谱的额度，并认可高峰时限流。", "多人同时写时，体验会先坏在等待和中断上。"],
            ["文献", "各方向继续按规范入库。使用范围和版权由实验室给一句书面说明。中心曾提过每个方向较大的入库量，是否仍按该目标执行，请老师确认。", "库是空的或不能用时，再调模型也写不好这一节。"],
            ["学术边界", "书面确认：人工智能起草的文字必须人工审校；数据和引用由作者负责。系统里已有免责入口，答辩和伦理口径与此一致。", "容易被理解成代写，或被按「能不能直接发表」来验收。"],
            ["人力", "不要求再配一名开发。若有条件，文献整理或服务器备份可以有兼职。", "单人开发能守住产品主路径。缺的是试用组织和库里的文献，不是再加一名写代码的人。"],
        ],
        [2.6, 8.2, 5.4],
    )

    heading(doc, "十、请老师填写")
    add_p(doc, "下列事项请直接写在本稿上，或会后回在邮件里。空白等于这一期先不启动。", after=8)

    form = [
        ["1", "是否同意本期目标为作者主笔的辅助写作，交账不按「一键可发表全文」。", "同意 □　　不同意 □　　修改意见："],
        ["2", "是否同意第一期只打穿一篇真实稿，细功能只改这篇稿卡住的地方。", "同意 □　　不同意 □"],
        ["3", "第一期经费上限与周期。建议 1～3 万元、4～8 周，可改。", "金额：__________ 元　　周期：________ 周"],
        ["4", "指定的稿，以及老师愿意看的那一节。", "题目或方向：\n截止：________ 年 ____ 月 ____ 日"],
        ["5", "必须试用的人（2～3 名，含执笔人）。", "姓名："],
        ["6", "模型费用是否走实验室账户，并允许按月设上限。", "同意 □　　不同意 □　　月上限：__________ 元"],
        ["7", "LaTeX。不勾选则本期不做。", "不做 □　　要做 □\n若要做：源文件 / 编译 PDF：________\n期刊范围：________\n与 Word 谁为主：________"],
        ["8", "其他实验室与面向全国。", "同意放在第一期交账之后再议 □　　本期就要承诺 □"],
    ]
    add_table(doc, ["序号", "事项", "老师意见"], form, [1.4, 7.4, 7.4])

    add_p(
        doc,
        "说明：文中产品价格来自公开页面的粗算。用户是否满意，没有问卷分数，文中不写。6 月 1 日的人天和金额只用于说明前期工作量，不能代替第一期的交账。事实以 2026 年 9 月 23 日仓库主线为准，最近提交说明为「每轮一个可见结果，蓝图与大纲都等人」。",
        size=10.5,
        color=MUTED,
        before=8,
    )

    doc.core_properties.title = "禾书耕文阶段汇报与下一期投入说明"
    doc.core_properties.subject = "课题组导师阅，2026-09-30"
    doc.core_properties.category = "内部汇报"
    doc.save(OUT)
    print(OUT)


if __name__ == "__main__":
    main()
