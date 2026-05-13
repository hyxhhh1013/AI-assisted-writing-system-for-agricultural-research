"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, FileText, Database, PenTool, BarChart3, Search,
  Download, Layout, CheckCircle2, Users, BookOpen, FlaskConical,
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
      '选择参考的知识库分类（可选「全部」或指定分类）',
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
      "自动跳转到「侧栏扩写」面板",
      "点击「生成」→ AI 会根据知识库文献撰写该小节",
      "满意后点击「应用到编辑器」",
      "子节内容会自动合入对应章节，不会覆盖已写好的其他部分",
    ],
  },
  {
    icon: Layout,
    title: "6. 编辑器与预览",
    badge: null,
    steps: [
      "中间是 TipTap 富文本编辑器，支持 Markdown 快捷键",
      "右侧是实时预览——即时看到排版效果",
      "工具栏按钮：引用重排 / 导出Word / 导出PDF / 导出Markdown / 一致性检查",
      "支持「经典模式」和「段落模式」切换",
    ],
  },
  {
    icon: Save,
    title: "7. 保存与自动保存",
    badge: null,
    steps: [
      "手动保存：点击左下角保存按钮，或 Ctrl+S",
      "自动保存：每 10 秒自动保存到云端",
      "切换章节前建议手动保存一次",
    ],
  },
  {
    icon: CheckCircle2,
    title: "8. 引用管理",
    badge: null,
    steps: [
      "AI 生成的所有引用 [n] 会自动关联到知识库文献",
      "写完全文后点击工具栏「引用重排」",
      "系统按正文首次出现顺序自动重排编号并更新所有引用标记",
    ],
  },
  {
    icon: Search,
    title: "9. 查重与降重",
    badge: { text: "开发中", color: "bg-amber-100 text-amber-700 border-amber-200" },
    steps: [
      "功能规划：上传论文段落 → 多源查重（知识库 / 历史项目 / 网络）",
      "重复段落自动标记，一键 AI 降重（同义替换 / 改写语序 / 语义重写）",
      "降重后自动回检，确保达标",
      "状态：基础功能已实现，增强版开发中",
    ],
  },
  {
    icon: BarChart3,
    title: "10. 专业图表生成",
    badge: { text: "开发中", color: "bg-amber-100 text-amber-700 border-amber-200" },
    steps: [
      "功能规划：XRD 峰拟合 / 背景扣除 / 晶胞参数计算",
      "流程图、分子结构式、反应机理图自动渲染",
      "通用实验数据图（折线/柱状/散点）",
      "状态：后端接口已预留，Python 渲染脚本开发中",
    ],
  },
  {
    icon: Download,
    title: "11. 导出与投稿",
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
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-emerald-600" />
            <div>
              <h1 className="text-lg font-bold text-slate-900">使用指南</h1>
              <p className="text-xs text-slate-500">禾书耕文 (GrainScript) — 快速上手</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/presentation">
              <Button variant="ghost" size="sm" className="text-xs gap-1">
                <Eye className="w-3.5 h-3.5" /> 项目演示
              </Button>
            </Link>
            <Link href="/workbench">
              <Button size="sm" className="text-xs gap-1 bg-emerald-600 hover:bg-emerald-700">
                进入工作台
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Intro card */}
        <div className="mb-10 p-6 bg-white border border-emerald-100 rounded-2xl shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <FlaskConical className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 mb-1">写给实验室的同学</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                这个系统帮你在写 SCI 论文时自动完成文献检索、内容扩写、引用管理和格式排版。
                最关键的步骤是第 3 步——<strong>上传的文献质量直接决定了 AI 写作的学术水平</strong>。
                文献越多、越相关，生成的内容越专业。
              </p>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-4">
          {sections.map((section, idx) => (
            <div key={idx} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <section.icon className="w-5 h-5 text-slate-700" />
                </div>
                <h3 className="text-base font-bold text-slate-900">{section.title}</h3>
                {section.badge && (
                  <Badge className={`text-[10px] border ${section.badge.color}`}>
                    {section.badge.text}
                  </Badge>
                )}
              </div>
              <ul className="space-y-1.5 ml-12">
                {section.steps.map((step, si) => (
                  <li key={si} className="text-sm text-slate-600 flex items-start gap-2">
                    <span className="text-emerald-400 mt-1 shrink-0">•</span>
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-10 p-5 bg-slate-100 border border-slate-200 rounded-2xl text-center">
          <p className="text-sm text-slate-600">
            有问题找 <span className="font-bold">黄奕轩</span> 或者在实验室群里提问
          </p>
          <p className="text-xs text-slate-400 mt-1">GrainScript v2.1.0 • 2026</p>
        </div>
      </main>
    </div>
  );
}
