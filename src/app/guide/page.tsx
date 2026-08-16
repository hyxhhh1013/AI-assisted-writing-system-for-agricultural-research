"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { siteTheme } from "@/lib/site-theme";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Bot,
  CheckCircle2,
  Database,
  Download,
  Eye,
  FileText,
  FlaskConical,
  Paperclip,
  Search,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface GuideSection {
  icon: LucideIcon;
  title: string;
  badge?: { text: string; color: string };
  steps: string[];
}

const sections: GuideSection[] = [
  {
    icon: FileText,
    title: "1. 注册与登录",
    steps: [
      "打开网站，右上角「登录」；第一次用点「注册」，填邮箱和密码",
      "每人一个账号，论文项目互不影响",
    ],
  },
  {
    icon: BookOpen,
    title: "2. 创建论文项目",
    steps: [
      "登录后「新建项目」，填题目、作者、研究方向",
      "选目标期刊模板（SCI / 国标 / Nature / IEEE 等）",
      "保存后进入工作台：左侧 Agent，中间是论文编辑器",
    ],
  },
  {
    icon: Database,
    title: "3. 准备文献",
    steps: [
      "顶栏进「知识库」，上传你课题相关的 PDF（越相关越好，不必一次堆 50 篇）",
      "实验室已有分类（热化学 / 碳材料等）可直接检索，不必重复上传",
      "也可以在 Agent 里说「检索并导入相关文献」，确认后再勾选入库",
      "文献质量直接决定草稿水平；没有相关 PDF，生成内容会空、会飘",
    ],
  },
  {
    icon: Bot,
    title: "4. 在 Agent 里写（主路径）",
    steps: [
      "工作台默认就是 Agent。直接说话，例如：「写引言」「写方法」「检查引用编号」",
      "跟聊回「继续 / 好 / A」会接着刚才的任务，不用把要求再说一遍",
      "正文写入当前项目对应章节，中间编辑器能看见；引用编号应落在文献池内",
      "写结果章前，把 CSV / Excel 丢进 Agent 对话框（附件就是数据口）；没有数据会拦住空写",
      "给的是可改草稿，不是终稿。数字、引用、语气都要自己过一眼",
    ],
  },
  {
    icon: Paperclip,
    title: "5. 出图",
    steps: [
      "跟 Agent 说要画什么（柱状图、三线表、机理图等），图会进图表库并插入章节",
      "期刊观感、配色、多面板精修走输入框上方的配图坞「期刊精修」，打开 /plot",
      "不要指望一键出 Nature 级终稿；Agent 负责结构正确的可编辑图",
    ],
  },
  {
    icon: Search,
    title: "6. 核对与导出",
    steps: [
      "引用：对 Agent 说「检查引用」；越界编号会被去掉并提示",
      "审查 / 查重：工作台可进质量中心（/review、/plagiarism），或让 Agent 跑审查",
      "导出：工具栏导出 Word / PDF；越界引用过不了导出就绪检查",
      "导出前先确认编辑器里是你要的版本",
    ],
  },
  {
    icon: Wrench,
    title: "7. 专家工具（可选，不是上手必经）",
    badge: { text: "进阶", color: "bg-amber-50 text-amber-700 border-amber-200" },
    steps: [
      "左侧「专家工具」里才有：论证提纲、协作扩写（旧 7 步管道）、数据面板、XRD",
      "新人不必先点提纲再扩写；那些是熟悉流程后的人控入口",
      "文献精读、划词翻译仍在知识库阅读器",
    ],
  },
];

export default function GuidePage() {
  return (
    <>
      <PageHeader
        title="使用指南"
        subtitle="禾书耕文 — 实验室同学从空项目写到可改草稿"
        icon={BookOpen}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/presentation">
              <Button variant="outline" size="sm" className="gap-1 border-[#1a5632]/20 text-xs">
                <Eye className="h-3.5 w-3.5" /> 项目演示
              </Button>
            </Link>
            <Link href="/workbench?tab=agent">
              <Button size="sm" className={`gap-1 text-xs ${siteTheme.btnPrimary}`}>
                打开 Agent 工作台
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
              这不是通用聊天。主入口是工作台里的 <strong className="text-[#122820]">Agent</strong>
              ：对着实验室文献库和你这篇稿说话，正文写进项目章节。
              上手就四步——注册、建项目、准备文献、跟 Agent 说要写哪一节。
              文献越相关，草稿越像样；没有数据不要硬写结果。
            </p>
            <p className="mt-2 flex items-start gap-1.5 text-sm text-[#6b7c72]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              Agent 给的是可编辑草稿。引用、实验数字、是否 overclaim，投稿前必须人审。
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {sections.map((section) => (
          <div
            key={section.title}
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
              {section.steps.map((step) => (
                <li key={step} className="flex items-start gap-2 text-sm text-[#6b7c72]">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1a5632]/50" />
                  {step}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-2xl border border-[#1a5632]/10 bg-[#1a5632]/5 p-5 text-center">
        <p className="text-sm text-[#3d4f46]">
          卡住了找 <span className="font-bold text-[#122820]">黄奕轩</span>，或在实验室群里提问
        </p>
        <p className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-[#9aa8a0]">
          <Link href="/academic-paper" className="underline underline-offset-2 hover:text-[#1a5632]">
            选已有项目进 Agent
          </Link>
          <span>·</span>
          <Link href="/knowledge" className="underline underline-offset-2 hover:text-[#1a5632]">
            知识库
          </Link>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <BarChart3 className="h-3 w-3" />
            <Link href="/plot" className="underline underline-offset-2 hover:text-[#1a5632]">
              配图坞
            </Link>
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <Download className="h-3 w-3" />
            导出在工作台工具栏
          </span>
        </p>
      </div>
    </>
  );
}
