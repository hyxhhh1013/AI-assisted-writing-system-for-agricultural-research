"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { siteTheme } from "@/lib/site-theme";
import {
  FileText, Database, PenTool, BarChart3, Search,
  Download, CheckCircle2, Users, BookOpen, FlaskConical,
  Construction, Wrench, Save, Eye, FileSearch, Radar,
} from "lucide-react";

const sections = [
  {
    icon: Users,
    title: "1. 注册与登录",
    badge: null,
    steps: [
      "打开网站，点击右上角「登录」",
      "首次使用点击「注册」，填写邮箱和密码",
      "每个同学独立账号，论文数据互不影响",
    ],
  },
  {
    icon: FileText,
    title: "2. 创建论文项目",
    badge: null,
    steps: [
      "登录后进入项目列表 → 点击「新建项目」",
      "填写论文标题、作者、研究方向",
      "选择目标期刊模板：SCI / 国标 GB/T 7713 / Nature / IEEE",
      "保存后进入工作台",
    ],
  },
  {
    icon: Database,
    title: "3. 上传知识库文献（最关键）",
    badge: null,
    steps: [
      "工作台左侧点击「文献库」图标（放大镜）",
      "上传你研究方向的相关 PDF 论文",
      "建议上传 20-50 篇高质量英文文献",
      "上传后系统自动解析并建立检索索引",
      "可按研究方向分类管理（热化学/碳材料/茶叶加工等）",
    ],
  },
  {
    icon: BookOpen,
    title: "4. 生成论文大纲",
    badge: null,
    steps: [
      "左侧点击「论证提纲」标签",
      "填写论文题目和研究方向（越详细越好）",
      "选择参考的知识库分类（可选「全部」或指定分类）",
      "点击「生成」→ AI 根据你的文献库生成结构化大纲",
      "大纲可编辑——直接在下方文本框修改后点「保存修改」",
    ],
  },
  {
    icon: PenTool,
    title: "5. 分任务逐节扩写",
    badge: null,
    steps: [
      "在大纲列表中点击某个子节（如「研究背景与意义」）",
      "左侧「侧栏扩写」面板自动填入上下文，中间编辑器切换为 AI 预览",
      "右侧面板实时显示 7 步管道进度：检索文献 → 证据整理 → AI 写作 → 审稿核查 → 主编修正 → 引用校验 → 数据核查",
      "生成过程中文字流式出现在中间编辑器，左侧栏显示核查意见和警告",
      "满意后点击「应用到编辑器」→ 内容按子节标题自动合入对应章节，不覆盖已有内容",
    ],
  },
  {
    icon: BarChart3,
    title: "6. 实验数据与证据",
    badge: null,
    steps: [
      "左侧切换到「数据」标签（研究论文模式）",
      "上传 CSV 或 Excel 实验数据文件",
      "填写研究方向后点击「开始数据分析」",
      "切换到「证据 Hub」→ 系统自动提取数据声明（EvidenceClaim）",
      "在写作时，AI 引用数据编号，Verifier 校验数值一致性",
      "证据可手动编辑、添加、删除，自动保存到项目",
    ],
  },
  {
    icon: Search,
    title: "7. 文献阅读与翻译",
    badge: null,
    steps: [
      "知识库页面点击文献 → 进入 PDF 阅读器",
      "划词选中英文段落 → 自动翻译（农业术语优化）",
      "支持全文检索、AI 对话问答、AI 精读分析",
      "单篇文献可强制重解析或重嵌向量（右键菜单）",
    ],
  },
  {
    icon: FileSearch,
    title: "8. 查重与降重",
    badge: null,
    steps: [
      "工作台左侧「查重」标签，或独立打开查重页面",
      "导入项目内容或粘贴文本 → 检测自重复 / 跨项目 / 本地库 / 网络",
      "SSE 实时推送进度：预处理 → 自检 → 跨项目 → 知识库 → 联网搜索",
      "查看匹配详情 → 使用 AI 降重（4 种策略）",
    ],
  },
  {
    icon: FileText,
    title: "9. 论文审查",
    badge: null,
    steps: [
      "查重页 → 「论文审查」→ 打开审查中心（/review）",
      "加载项目真实的 IMRAD 章节进行多维度审查",
      "四个维度：学术规范 / 论证质量 / 结构规范 / 学术诚信",
      "查看历史审查记录，展开详情按维度分组查看问题",
      "发现问题可点击「修复」→ AI 生成建议 →「接受修复」写回章节",
    ],
  },
  {
    icon: Radar,
    title: "10. 一致性检查",
    badge: null,
    steps: [
      "工作台工具栏 → 「一致性检查」",
      "自动核对 6 个维度：术语 / 数据 / 逻辑 / Overclaim / 引用 / 溯源",
      "生成报告，标注需修正的段落",
    ],
  },
  {
    icon: Wrench,
    title: "11. 科学绘图",
    badge: null,
    steps: [
      "工作台或主页进入「科学绘图」",
      "选择图表类型（柱状/折线/XRD/流程图等）",
      "填写数据 → 生成 PNG",
      "用「插入到论文」对话框选择项目和章节直接写入",
      "也可复制 Markdown 手动粘贴到编辑器",
    ],
  },
  {
    icon: Construction,
    title: "12. XRD / XPS 实验室",
    badge: { text: "进阶", color: "bg-amber-50 text-amber-700 border-amber-200" },
    steps: [
      "模拟 XRD 谱图、分析 XPS 数据、绘制分子结构",
      "生成图片可直接插入到项目指定章节",
    ],
  },
  {
    icon: Download,
    title: "13. 导出与投稿",
    badge: null,
    steps: [
      "写完论文后点击工具栏「导出 Word」",
      "系统按目标期刊模板自动排版（字体、字号、行距、标题格式）",
      "支持导出 PDF（学术排版）和 Markdown（纯文本）",
      "导出前请先手动保存一次",
    ],
  },
];

export default function GuidePage() {
  return (
    <>
      <PageHeader
        title="使用指南"
        subtitle="禾书耕文 GrainScript — 实验室同学快速上手"
        icon={BookOpen}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/presentation">
              <Button variant="outline" size="sm" className="gap-1 border-[#1a5632]/20 text-xs">
                <Eye className="h-3.5 w-3.5" /> 项目演示
              </Button>
            </Link>
            <Link href="/workbench">
              <Button size="sm" className={`gap-1 text-xs ${siteTheme.btnPrimary}`}>
                进入工作台
              </Button>
            </Link>
          </div>
        }
      />

      <div className={`mb-10 p-6 ${siteTheme.card}`}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1a5632]/10">
            <FlaskConical className="h-5 w-5 text-[#1a5632]" />
          </div>
          <div>
            <h2 className="mb-1 text-base font-bold text-[#122820]">写给实验室的同学</h2>
            <p className="text-sm leading-relaxed text-[#6b7c72]">
              这个系统帮你在写 SCI 论文时自动完成文献检索、内容扩写、引用管理和格式排版。
              最关键的步骤是第 3 步——<strong className="text-[#122820]">上传的文献质量直接决定了 AI 写作的学术水平</strong>。
              文献越多、越相关，生成的内容越专业。
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {sections.map((section, idx) => (
          <div
            key={idx}
            className={`p-6 ${siteTheme.card} ${siteTheme.cardHover}`}
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1a5632]/8">
                <section.icon className="h-5 w-5 text-[#1a5632]" />
              </div>
              <h3 className="text-base font-bold text-[#122820]">{section.title}</h3>
              {section.badge ? (
                <Badge className={`border text-[10px] ${section.badge.color}`}>
                  {section.badge.text}
                </Badge>
              ) : null}
            </div>
            <ul className="ml-12 space-y-1.5">
              {section.steps.map((step, si) => (
                <li key={si} className="flex items-start gap-2 text-sm text-[#6b7c72]">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1a5632]/50" />
                  {step}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className={`mt-10 rounded-2xl border border-[#1a5632]/10 bg-[#1a5632]/5 p-5 text-center`}>
        <p className="text-sm text-[#3d4f46]">
          有问题找 <span className="font-bold text-[#122820]">黄奕轩</span> 或者在实验室群里提问
        </p>
        <p className="mt-1 text-xs text-[#9aa8a0]">GrainScript v2.2.0 · 2026-05</p>
      </div>
    </>
  );
}
