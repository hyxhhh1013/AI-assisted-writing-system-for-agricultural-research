"use client";

import React from "react";
import {
  CheckCircle2, ArrowRight, Target, Flag, Calendar,
  ChevronRight, Wheat, Sparkles, ShieldCheck, Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const item = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

function PhaseCard({
  phase,
  date,
  goal,
  color,
  weeks,
}: {
  phase: string;
  date: string;
  goal: string;
  color: { bg: string; border: string; badge: string; dot: string; title: string; line: string };
  weeks: { label: string; tasks: string[] }[];
}) {
  return (
    <motion.div variants={item} className={`${color.bg} ${color.border} border rounded-2xl p-6 md:p-8`}>
      <div className="flex items-center gap-4 mb-6">
        <div className={`w-12 h-12 rounded-xl ${color.badge} text-white flex items-center justify-center`}>
          <Flag className="w-6 h-6" />
        </div>
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className={`text-2xl font-black ${color.title}`}>{phase}</h3>
            <Badge className={color.badge + " border-0 text-xs"}>{date}</Badge>
          </div>
          <p className="text-slate-500 text-sm mt-0.5">目标：{goal}</p>
        </div>
      </div>

      <div className="space-y-4">
        {weeks.map((w, i) => (
          <div key={i} className="relative pl-6">
            <div className={`absolute left-[7px] top-3 bottom-0 w-px ${i < weeks.length - 1 ? color.line : "bg-transparent"}`} />
            <div className={`absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full border-2 ${color.border} bg-white flex items-center justify-center`}>
              <div className={`w-[7px] h-[7px] rounded-full ${color.dot}`} />
            </div>
            <div className="pb-1">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {w.label}
              </h4>
              <ul className="mt-2 space-y-1.5">
                {w.tasks.map((t, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-slate-600">
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0 mt-0.5" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function DoneItem({ label, detail }: { label: string; detail?: string }) {
  return (
    <motion.div variants={item} className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-100">
      <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-slate-900 font-medium text-sm">{label}</p>
        {detail && <p className="text-slate-400 text-xs mt-0.5">{detail}</p>}
      </div>
    </motion.div>
  );
}

const phase1Weeks = [
  {
    label: "6/1 – 6/14（2 周）· 部署 + 批量扩写",
    tasks: [
      "VPS 公网部署：配置域名 + HTTPS，实验室同学可访问，48h 稳定性验证",
      "批量扩写：选中大纲多个子节 → 排队依次扩写，每完成一节自动合入编辑器",
      "扩写进度可恢复：扩写 session 跨刷新保持，刷新后从断点继续",
    ],
  },
  {
    label: "6/15 – 7/5（3 周）· 真课题验证",
    tasks: [
      "3~5 个真实课题全流程验证（不同农业子方向）",
      "收集实验室同学反馈，修复 P0/P1 问题",
      "撤销/重做：扩写后不满意 → 一键回退到扩写前版本",
      "根据真实课题反馈，针对性优化各环节 prompt",
    ],
  },
  {
    label: "7/6 – 7/19（2 周）· 体验打磨",
    tasks: [
      "投前自检报告：导出前自动跑 Overclaim 扫描、Methods 完整性、引用完整性",
      "图表-正文联动：Verifier 检查正文数值与图表原始数据一致性",
      "风格校准（初版）：上传已发表论文 → 提取句式特征 → Writer 模仿",
    ],
  },
];

const phase2Weeks = [
  {
    label: "7/20 – 8/16（4 周）· 数据证据层",
    tasks: [
      "多文件分析：上传多个 CSV → 自动关联变量 → 跨文件对比分析（当前只支持单文件）",
      "DataClaim 体系完善：图表数据 ↔ 正文数值 ↔ 统计结果 三方交叉校验",
      "引文事实核查升级：从关键词重叠率改为 NLI 语义比对模型，降低误报率",
    ],
  },
  {
    label: "8/17 – 9/20（5 周）· 基础设施加固",
    tasks: [
      "Prisma 迁移规范化：db push → 正式 migration，消除 shadow db 不一致风险",
      "API 请求队列：快速连续点扩写时取消前一个请求，避免双管道并行",
      "图表自动插入：数据分析完成 → 推荐图表列表 → 一键插入到对应章节位置",
      "使用统计面板：记录每次扩写的 token 消耗、耗时、成功率",
    ],
  },
];

const phase3Weeks = [
  {
    label: "9/21 – 10/31（6 周）· 多期刊 + 模板扩展",
    tasks: [
      "多期刊模板适配：在现有 4 种基础上新增 1~2 种农业领域常用期刊格式",
      "领域写作规则细化：控释肥、茶学、热解等方向定制专属 prompt 惯例",
      "风格校准（完整版）：支持多作者风格保存、切换、对比",
    ],
  },
  {
    label: "11/1 – 12/20（7 周）· 整体打磨 + 试用",
    tasks: [
      "全流程回归测试：用 5 个不同方向课题跑通「大纲→扩写→审查→导出」",
      "bug 修复 + 性能优化 + 文档更新",
      "实验室内部试用 + 培训 + 持续收集反馈迭代",
    ],
  },
];

export default function RoadmapPage() {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="pb-8 pt-2 text-center px-6"
      >
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#1a5632]/15 bg-[#1a5632]/8 px-3 py-1 text-xs font-medium text-[#1a5632]">
          <Target className="h-3.5 w-3.5" />
          项目推进计划
        </div>
        <h1 className="text-4xl font-black tracking-tight text-[#122820] md:text-5xl">
          禾书耕文 · 时间推进表
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-[#6b7c72] md:text-base">
          6 个月，三个阶段，从「能写」到「能投」。每个阶段有明确的交付物和验收标准。
        </p>
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[#9aa8a0]">
          <Wheat className="h-3.5 w-3.5" />
          <span>最后更新：2026-05-27</span>
        </div>
      </motion.div>

      <div className="mx-auto max-w-4xl space-y-12 px-4 pb-8">
        {/* ── 已完成 ── */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="h-0.5 w-8 bg-emerald-500 rounded-full" />
            <span className="text-emerald-600 font-mono text-[10px] font-bold tracking-[0.3em] uppercase">Completed</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-1">已完成（2026.04 下旬 – 2026.05）</h2>
          <p className="text-slate-500 text-sm mb-6">三周搭建了完整的技术底座，核心写作流程已跑通。</p>

          <GlassCard className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <DoneItem label="多 Agent 写作管道" detail="Writer (DeepSeek) → Verifier (智谱) → Refiner，SSE 流式输出" />
              <DoneItem label="RAG 混合检索引擎" detail="BM25 + 向量语义 + RRF 融合，910 篇论文 / 7 个领域 / 12K+ 知识块" />
              <DoneItem label="引用真实性逐条验证" detail="Verifier 拿到原文比对，标记「归属错误」和「疑似虚构」" />
              <DoneItem label="AI 降重（4 策略）" detail="同义替换 / 改语序 / 概括 / 扩写，保持学术原意" />
              <DoneItem label="14 种专业图表" detail="分组柱状/折线/散点/饼/流程图/分子结构/XRD 分析/三线表" />
              <DoneItem label="DOCX / PDF 多模板导出" detail="SCI、GB/T 7713、Nature、IEEE 四种模板" />
              <DoneItem label="PDF 文献阅读器" detail="划词翻译（农业术语）、全文检索、分类管理" />
              <DoneItem label="项目管理系统" detail="多项目管理、章节编辑、自动保存、版本记录" />
              <DoneItem label="JWT 认证系统" detail="注册 / 登录 / 多用户隔离" />
              <DoneItem label="一致性检查（6维度）" detail="术语/数据/逻辑/Overclaim/引用/溯源跨章节自动核对" />
              <DoneItem label="架构 v2 重构" detail="契约层 + 增量保存 + SSE 统一 + hooks 抽取，TS 零错误" />
              <DoneItem label="38 条 API + 15 个功能页面" detail="全功能覆盖，Zod 输入校验 + AI 端点限流" />
            </div>
          </GlassCard>
        </motion.section>

        {/* ── Phase 1: 写作质量 + 核心体验 ── */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="h-0.5 w-8 bg-emerald-500 rounded-full" />
            <span className="text-emerald-600 font-mono text-[10px] font-bold tracking-[0.3em] uppercase">Phase 1</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-1">第一阶段：部署上线 + 真课题验证</h2>
          <p className="text-slate-500 text-sm mb-6">
            核心目标：让系统从「本地能跑」变成「实验室能用」。部署上线、真课题验证、补齐体验短板。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[
              { icon: Zap, label: "VPS 部署", desc: "配置域名 + HTTPS，实验室同学可访问" },
              { icon: Sparkles, label: "真课题验证", desc: "3-5 个不同方向课题跑通全流程" },
              { icon: ShieldCheck, label: "批量扩写", desc: "选中多子节 → 排队生成，实验室最高频需求" },
            ].map((p, i) => (
              <motion.div key={i} variants={item} className="p-4 bg-white rounded-xl border border-emerald-100 text-center">
                <p.icon className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                <p className="font-bold text-slate-900 text-sm">{p.label}</p>
                <p className="text-slate-400 text-xs mt-0.5">{p.desc}</p>
              </motion.div>
            ))}
          </div>

          <PhaseCard
            phase="部署上线 + 真课题验证"
            date="6/1 – 7/19（7 周）"
            goal="系统从「本地能跑」升级到「实验室能用」"
            color={{
              bg: "bg-emerald-50/50",
              border: "border-emerald-200",
              badge: "bg-emerald-500",
              dot: "bg-emerald-400",
              title: "text-emerald-700",
              line: "bg-emerald-200",
            }}
            weeks={phase1Weeks}
          />
        </motion.section>

        {/* ── Phase 2: 数据证据 + 基础设施 ── */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="h-0.5 w-8 bg-blue-500 rounded-full" />
            <span className="text-blue-600 font-mono text-[10px] font-bold tracking-[0.3em] uppercase">Phase 2</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-1">第二阶段：数据证据 + 基础设施</h2>
          <p className="text-slate-500 text-sm mb-6">
            图表-正文数据闭环 + 系统稳定性加固。根据第一阶段反馈调整优先级。
          </p>

          <PhaseCard
            phase="数据 + 基础设施"
            date="7/20 – 9/20（9 周）"
            goal="图表-正文数据闭环验证、系统稳定可靠"
            color={{
              bg: "bg-blue-50/50",
              border: "border-blue-200",
              badge: "bg-blue-500",
              dot: "bg-blue-400",
              title: "text-blue-700",
              line: "bg-blue-200",
            }}
            weeks={phase2Weeks}
          />
        </motion.section>

        {/* ── Phase 3: 打磨 + 发布 ── */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="h-0.5 w-8 bg-purple-500 rounded-full" />
            <span className="text-purple-600 font-mono text-[10px] font-bold tracking-[0.3em] uppercase">Phase 3</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-1">第三阶段：打磨 + 试用</h2>
          <p className="text-slate-500 text-sm mb-6">
            多期刊模板扩展、全流程回归测试、实验室内部试用培训。
          </p>

          <PhaseCard
            phase="打磨 + 试用"
            date="9/21 – 12/20（13 周）"
            goal="多期刊模板、全流程验证、实验室内部试用"
            color={{
              bg: "bg-purple-50/50",
              border: "border-purple-200",
              badge: "bg-purple-500",
              dot: "bg-purple-400",
              title: "text-purple-700",
              line: "bg-purple-200",
            }}
            weeks={phase3Weeks}
          />
        </motion.section>

        {/* ── Back to presentation ── */}
        <motion.div variants={item} className="text-center pt-8">
          <Link href="/presentation">
            <Button variant="outline" className="gap-2 border-slate-200 text-slate-500 hover:text-slate-700">
              <ArrowRight className="w-4 h-4" />
              返回项目演示
            </Button>
          </Link>
        </motion.div>
      </div>
    </>
  );
}
