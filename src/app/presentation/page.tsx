"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, FileText, PenTool,
  BarChart3, ShieldCheck, Download, Search, CheckCircle2,
  ArrowRight, Sparkles, BookOpen, GitBranch, AlertTriangle,
  Clock, TrendingUp, Wrench, Library, ListChecks, ScanEye,
  MessageSquareText, Globe, Microscope, Wheat,
  Link2, Layers,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AgriBackground } from "@/components/ui/AgriBackground";
import { GlassCard } from "@/components/ui/GlassCard";
import Link from "next/link";

const slideVariants = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const, staggerChildren: 0.08 } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.3, ease: "easeInOut" as const } },
} as const;

const itemVariants = {
  initial: { opacity: 0, y: 15 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
} as const;

interface SlideContent { id: string; title: string; subtitle?: string; content: React.ReactNode; }

// ================================================================
// 14 张幻灯片 — 四层叙事：共鸣 → 概览 → 能力 → 价值
// ================================================================

// ── 共鸣层：建立认同 (Slides 1-3) ──

const slides: SlideContent[] = [
  // Slide 1：封面
  {
    id: "cover",
    title: "",
    content: (
      <div className="flex flex-col items-center justify-center text-center space-y-8">
        <motion.div variants={itemVariants} className="relative group">
          <div className="absolute inset-0 bg-emerald-100 blur-[50px] rounded-full" />
          <div className="relative p-12 bg-white rounded-[2.5rem] border border-emerald-100 shadow-2xl">
            <Wheat className="w-24 h-24 text-emerald-600" />
          </div>
        </motion.div>
        <div className="space-y-3">
          <motion.h1 variants={itemVariants} className="text-7xl md:text-8xl font-black tracking-tighter text-slate-900">
            禾书耕文
          </motion.h1>
          <motion.p variants={itemVariants} className="text-2xl text-emerald-600 font-medium">
            GrainScript
          </motion.p>
          <motion.p variants={itemVariants} className="text-lg text-slate-500 max-w-xl leading-relaxed">
            一个专为农业科研设计的<br />AI 论文写作辅助系统
          </motion.p>
        </div>
        <motion.div variants={itemVariants} className="pt-8 flex flex-col items-center gap-3">
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 px-6 py-2 rounded-full text-base font-medium">
            汇报人：黄奕轩
          </Badge>
          <p className="text-slate-400 font-mono tracking-widest text-[10px] uppercase">2026 · Agricultural AI Research</p>
        </motion.div>
      </div>
    ),
  },

  // Slide 2：科研写作的"隐形工作量"
  {
    id: "pain-points",
    title: "写一篇论文，时间都花在哪了？",
    subtitle: "80% 的时间消耗在重复性劳动上",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
        <motion.div variants={itemVariants} className="space-y-5">
          {[
            { icon: Search, label: "查文献", desc: "几十上百篇文献中翻找支撑论点的依据，耗时耗力", pct: "30%" },
            { icon: PenTool, label: "写初稿", desc: "把实验数据转化为规范的学术语言，反复修改措辞", pct: "35%" },
            { icon: ListChecks, label: "核对校验", desc: "引用编号、数据一致性、格式规范……一项项人工核对", pct: "15%" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-5 p-5 bg-white rounded-2xl border border-slate-100 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center">
                <item.icon className="w-6 h-6 text-slate-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-900">{item.label}</span>
                  <span className="text-emerald-600 font-black text-lg">{item.pct}</span>
                </div>
                <p className="text-slate-500 text-sm">{item.desc}</p>
              </div>
            </div>
          ))}
        </motion.div>
        <motion.div variants={itemVariants} className="flex flex-col items-center">
          <div className="relative w-64 h-64">
            <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
              <circle cx="100" cy="100" r="80" fill="none" stroke="#f1f5f9" strokeWidth="30" />
              <circle cx="100" cy="100" r="80" fill="none" stroke="#f59e0b" strokeWidth="30"
                strokeDasharray={`${0.30 * 2 * Math.PI * 80} ${2 * Math.PI * 80}`} strokeLinecap="round" />
              <circle cx="100" cy="100" r="80" fill="none" stroke="#ef4444" strokeWidth="30"
                strokeDasharray={`${0.35 * 2 * Math.PI * 80} ${2 * Math.PI * 80}`}
                strokeDashoffset={`${-0.30 * 2 * Math.PI * 80}`} strokeLinecap="round" />
              <circle cx="100" cy="100" r="80" fill="none" stroke="#3b82f6" strokeWidth="30"
                strokeDasharray={`${0.15 * 2 * Math.PI * 80} ${2 * Math.PI * 80}`}
                strokeDashoffset={`${-0.65 * 2 * Math.PI * 80}`} strokeLinecap="round" />
              <circle cx="100" cy="100" r="80" fill="none" stroke="#10b981" strokeWidth="30"
                strokeDasharray={`${0.20 * 2 * Math.PI * 80} ${2 * Math.PI * 80}`}
                strokeDashoffset={`${-0.80 * 2 * Math.PI * 80}`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-3xl font-black text-slate-900">80%</p>
                <p className="text-xs text-slate-500">机械劳动</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-4">
            {[{ color: "bg-amber-500", label: "查文献 30%" }, { color: "bg-red-500", label: "写初稿 35%" },
              { color: "bg-blue-500", label: "核对 15%" }, { color: "bg-emerald-500", label: "思考创新 20%" },
            ].map((l, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                <div className={`w-2.5 h-2.5 rounded-sm ${l.color}`} />{l.label}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    ),
  },

  // Slide 3：传统方式 vs AI辅助
  {
    id: "before-after",
    title: "有了 AI 辅助，能省下多少时间？",
    subtitle: "不是替代思考，是解放重复劳动",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <motion.div variants={itemVariants} className="p-8 bg-slate-50 rounded-3xl border border-slate-200">
          <p className="text-slate-400 text-sm font-bold mb-6 uppercase tracking-widest">传统方式</p>
          {[
            { label: "查阅文献", time: "2-4 周" },
            { label: "撰写初稿", time: "4-8 周" },
            { label: "格式校对", time: "1-2 周" },
            { label: "引用整理", time: "3-5 天" },
            { label: "图表制作", time: "1-2 周" },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-slate-200 last:border-0">
              <span className="text-slate-700">{item.label}</span>
              <span className="text-slate-900 font-bold">{item.time}</span>
            </div>
          ))}
          <div className="mt-4 pt-4 border-t-2 border-slate-300 flex justify-between">
            <span className="text-slate-900 font-bold text-lg">合计</span>
            <span className="text-rose-600 font-black text-xl">2-4 个月</span>
          </div>
        </motion.div>
        <motion.div variants={itemVariants} className="p-8 bg-emerald-50 rounded-3xl border border-emerald-200">
          <p className="text-emerald-600 text-sm font-bold mb-6 uppercase tracking-widest">AI 辅助后</p>
          {[
            { label: "文献检索", time: "几秒钟" },
            { label: "初稿生成", time: "5-10 分钟" },
            { label: "格式校对", time: "自动完成" },
            { label: "引用整理", time: "自动完成" },
            { label: "图表制作", time: "上传即生成" },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-emerald-100 last:border-0">
              <span className="text-emerald-800">{item.label}</span>
              <span className="text-emerald-700 font-bold">{item.time}</span>
            </div>
          ))}
          <div className="mt-4 pt-4 border-t-2 border-emerald-300 flex justify-between">
            <span className="text-emerald-900 font-bold text-lg">合计</span>
            <span className="text-emerald-600 font-black text-xl">分钟级</span>
          </div>
          <p className="text-emerald-700 text-sm mt-4 italic">
            但需要人工审核和修改——AI 是加速器，不是自动驾驶
          </p>
        </motion.div>
      </div>
    ),
  },

  // ── 概览层：建立认知 (Slides 4-5) ──

  // Slide 4：五大模块总览
  {
    id: "modules",
    title: "系统由五大模块组成",
    subtitle: "每个模块对应论文写作的一个环节",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {[
          { num: "01", title: "知识库", desc: "把实验室的论文变成 AI 可检索的「专属图书馆」", icon: Library, color: "border-amber-300 bg-amber-50", dot: "bg-amber-500" },
          { num: "02", title: "写作引擎", desc: "按论文章节结构，一段一段自动生成初稿", icon: PenTool, color: "border-blue-300 bg-blue-50", dot: "bg-blue-500" },
          { num: "03", title: "质量检查", desc: "查引用、查数据、查措辞——写完之后的全面「体检」", icon: ShieldCheck, color: "border-emerald-300 bg-emerald-50", dot: "bg-emerald-500" },
          { num: "04", title: "图表工具", desc: "实验数据直接生成发表级图表", icon: BarChart3, color: "border-purple-300 bg-purple-50", dot: "bg-purple-500" },
          { num: "05", title: "格式导出", desc: "PDF / Word 一键导出，含公式和引用", icon: Download, color: "border-slate-300 bg-slate-50", dot: "bg-slate-500" },
        ].map((m, i) => (
          <motion.div key={i} variants={itemVariants}
            className={`${m.color} border rounded-2xl p-5 flex flex-col items-center text-center gap-3`}>
            <div className={`w-12 h-12 rounded-xl ${m.dot} text-white flex items-center justify-center font-black text-sm`}>{m.num}</div>
            <m.icon className="w-8 h-8 text-slate-600" />
            <h4 className="font-bold text-slate-900">{m.title}</h4>
            <p className="text-slate-500 text-xs leading-relaxed">{m.desc}</p>
          </motion.div>
        ))}
      </div>
    ),
  },

  // Slide 5：完整流程演示 —— 最能让听众"听懂"的一张
  {
    id: "workflow",
    title: "从头到尾：写一篇论文的实际流程",
    subtitle: "每一步都有明确的时间预期",
    content: (
      <div className="space-y-4">
        {[
          { step: "1", title: "输入论文标题和研究方向", time: "10 秒", detail: "例如：「控释氮肥对水稻产量和氮素利用效率的影响」— 研究方向：水稻栽培", icon: MessageSquareText, color: "border-slate-200" },
          { step: "2", title: "AI 生成论文大纲", time: "约 30 秒", detail: "自动判断论文类型 → 生成 IMRAD 结构大纲，每个子标题含要点说明", icon: ListChecks, color: "border-amber-200" },
          { step: "3", title: "从知识库检索相关文献", time: "约 3-5 秒", detail: "按章节定向检索 — 引言查背景、方法查方案、结果查数据", icon: Search, color: "border-blue-200" },
          { step: "4", title: "逐节扩写初稿", time: "每节 30-60 秒", detail: "Writer AI 按章节写作规则生成内容，实时流式显示", icon: PenTool, color: "border-emerald-200" },
          { step: "5", title: "AI 审核 + 修正", time: "每节 20-40 秒", detail: "Verifier 挑毛病 → Refiner 修改 — 独立 AI 审查，避免「自己审自己」", icon: ScanEye, color: "border-purple-200" },
          { step: "6", title: "一致性检查 + 图表插入", time: "约 30 秒", detail: "6 维度跨章节检查 → 自动配图 → 引用编号校对", icon: ShieldCheck, color: "border-rose-200" },
          { step: "7", title: "导出 PDF / Word", time: "约 10 秒", detail: "含公式渲染、引用列表、图表嵌入，可直接提交或进一步修改", icon: Download, color: "border-slate-400" },
        ].map((s, i) => (
          <motion.div key={i} variants={itemVariants}
            className={`flex items-center gap-5 p-4 rounded-2xl border ${s.color} bg-white`}>
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm flex-shrink-0">{s.step}</div>
            <s.icon className="w-5 h-5 text-slate-400 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-bold text-slate-900 text-sm">{s.title}</h4>
              <p className="text-slate-400 text-xs">{s.detail}</p>
            </div>
            <Badge className="bg-emerald-50 text-emerald-700 border-0 text-[10px] flex-shrink-0">{s.time}</Badge>
          </motion.div>
        ))}
      </div>
    ),
  },

  // ── 能力层：展示核心功能 (Slides 6-9) ──

  // Slide 6：知识库
  {
    id: "knowledge-1",
    title: "你的专属「论文图书馆」",
    subtitle: "AI 不凭空编造——它从你实验室的真实论文里找依据",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
        <motion.div variants={itemVariants} className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100 text-center">
              <p className="text-4xl font-black text-amber-600">910</p>
              <p className="text-sm text-amber-700 mt-1">篇已索引论文</p>
            </div>
            <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 text-center">
              <p className="text-4xl font-black text-blue-600">6</p>
              <p className="text-sm text-blue-700 mt-1">个研究领域</p>
            </div>
            <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
              <p className="text-4xl font-black text-emerald-600">2.6</p>
              <p className="text-sm text-emerald-700 mt-1">GB 知识总量</p>
            </div>
          </div>
          <div className="p-5 bg-white rounded-2xl border border-slate-100">
            <p className="text-slate-700 text-sm leading-relaxed">
              <span className="font-bold">通俗解释：</span>
              就像给 AI 配了一个只属于你们实验室的「论文书架」。写作时，AI 从这个书架里找最相关的段落作为参考，而不是从互联网上胡乱搜索。
            </p>
          </div>
        </motion.div>
        <motion.div variants={itemVariants}>
          <GlassCard className="p-6 space-y-3">
            <h4 className="font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-500" /> 已建立的领域分类
            </h4>
            {[
              { cat: "控释肥类", n: "100 篇" }, { cat: "茶学", n: "178 篇" },
              { cat: "烟草", n: "142 篇" }, { cat: "热化学", n: "167 篇" },
              { cat: "热解", n: "139 篇" }, { cat: "烟花", n: "184 篇" },
            ].map((c, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <span className="text-slate-700 text-sm font-medium">{c.cat}</span>
                <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">{c.n}</Badge>
              </div>
            ))}
          </GlassCard>
        </motion.div>
      </div>
    ),
  },

  // Slide 7：写作引擎
  {
    id: "writing-1",
    title: "AI 怎么写论文？",
    subtitle: "不是一次写完——而是「写→审→改」三步走",
    content: (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { step: "第一步", title: "写作", who: "AI 写手", desc: "根据你的标题和大纲，参考知识库里的论文，逐节生成初稿。每个章节有专门的写作规则。", icon: PenTool, color: "bg-blue-50 border-blue-200", iconBg: "bg-blue-500" },
            { step: "第二步", title: "审核", who: "AI 审查员", desc: "用另一个独立的 AI 检查初稿：引用是否真实、数据是否前后一致、有没有过度夸大。", icon: ScanEye, color: "bg-emerald-50 border-emerald-200", iconBg: "bg-emerald-500" },
            { step: "第三步", title: "修改", who: "AI 编辑", desc: "根据审查意见逐条修改。只改有问题的部分，不动原文的风格和观点。", icon: Wrench, color: "bg-purple-50 border-purple-200", iconBg: "bg-purple-500" },
          ].map((s, i) => (
            <motion.div key={i} variants={itemVariants}
              className={`${s.color} border rounded-2xl p-6 flex flex-col items-center text-center gap-4`}>
              <div className={`w-14 h-14 rounded-2xl ${s.iconBg} text-white flex items-center justify-center`}>
                <s.icon className="w-7 h-7" />
              </div>
              <div>
                <p className="text-[10px] font-mono text-slate-400 mb-1">{s.step}</p>
                <h4 className="font-bold text-slate-900 text-lg">{s.title}</h4>
                <Badge className="mt-1 mb-2 border-0 text-[10px]">{s.who}</Badge>
                <p className="text-slate-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
        <motion.div variants={itemVariants} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-4">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-slate-900 text-sm">为什么「写作」和「审查」要用两个不同的 AI？</p>
            <p className="text-slate-500 text-sm mt-1">
              就像考试时自己检查自己的卷子容易漏掉错误——让另一个独立的 AI 来审，等于请了一个「挑刺的」，更容易发现问题。
            </p>
          </div>
        </motion.div>
      </div>
    ),
  },

  // Slide 8：质量保障（质量检查 + 查重合并）
  {
    id: "quality",
    title: "写完还要「体检」+「查重」",
    subtitle: "六项检查 + 三种改写策略，双管齐下",
    content: (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { icon: MessageSquareText, title: "术语一致性", desc: "品种名、处理代号、测定指标全篇是否统一", color: "bg-blue-50 border-blue-100" },
            { icon: BarChart3, title: "数据一致性", desc: "Results 里的数字和 Discussion、Conclusion 是否对得上", color: "bg-emerald-50 border-emerald-100" },
            { icon: GitBranch, title: "逻辑连贯性", desc: "Introduction 提的问题 → Results 有没有回答 → Discussion 有没有解释", color: "bg-purple-50 border-purple-100" },
            { icon: AlertTriangle, title: "Overclaim 扫描", desc: "全文扫描：有没有「首次」「最优」等过度措辞", color: "bg-rose-50 border-rose-100" },
            { icon: Link2, title: "引用一致性", desc: "文中 [5] 和文献列表的第 5 条是不是同一篇", color: "bg-amber-50 border-amber-100" },
            { icon: Search, title: "数据溯源", desc: "每个数字和结论是否标注了数据来源", color: "bg-indigo-50 border-indigo-100" },
          ].map((item, i) => (
            <motion.div key={i} variants={itemVariants}
              className={`${item.color} border rounded-xl p-4 flex flex-col gap-2`}>
              <item.icon className="w-6 h-6 text-slate-600" />
              <h4 className="font-bold text-slate-900 text-sm">{item.title}</h4>
              <p className="text-slate-500 text-xs leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-5 bg-rose-50 rounded-2xl border border-rose-100">
            <div className="flex items-center gap-3 mb-3">
              <Search className="w-5 h-5 text-rose-500" />
              <h4 className="font-bold text-slate-900">查重引擎</h4>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">
              把你的论文和知识库里的 910 篇论文做比对，标出相似段落。AI 能识别「意思相同但换了说法」的段落。
            </p>
          </div>
          <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100">
            <div className="flex items-center gap-3 mb-3">
              <Wrench className="w-5 h-5 text-emerald-500" />
              <h4 className="font-bold text-slate-900">三种改写策略</h4>
            </div>
            <div className="space-y-2">
              {["同义替换：换个说法表达同一个意思", "语序调整：重新组织句子结构", "扩写/缩写：展开或精简内容"].map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />{s}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    ),
  },

  // Slide 9：图表系统
  {
    id: "charts",
    title: "数据直接变图表",
    subtitle: "15 种图表类型，上传数据即可生成",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <motion.div variants={itemVariants} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { cat: "数据图表", items: ["分组柱状图", "堆积柱状图", "折线图", "散点图", "饼图"], n: 6 },
              { cat: "示意图", items: ["流程图/机理图", "分子结构图"], n: 2 },
              { cat: "XRD 分析", items: ["峰拟合", "晶胞可视化", "Bragg 计算", "XPS 分析"], n: 6 },
              { cat: "表格", items: ["三线表 (GB/T 7714)"], n: 1 },
            ].map((g, i) => (
              <div key={i} className="p-4 bg-white rounded-2xl border border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-slate-900 text-sm">{g.cat}</h4>
                  <Badge className="bg-slate-100 text-slate-600 border-0 text-[10px]">{g.n} 种</Badge>
                </div>
                <div className="space-y-1">
                  {g.items.map((it, j) => (
                    <div key={j} className="flex items-center gap-2 text-xs text-slate-500">
                      <div className="w-1 h-1 rounded-full bg-emerald-400" />{it}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
        <motion.div variants={itemVariants} className="space-y-5">
          <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100">
            <h4 className="font-bold text-slate-900 mb-3">工作流程</h4>
            <div className="space-y-3">
              {[
                { step: "1", text: "上传你的实验数据（CSV / Excel）" },
                { step: "2", text: "系统自动分析数据结构" },
                { step: "3", text: "推荐最合适的图表类型" },
                { step: "4", text: "一键生成，可下载为高清图片" },
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">{s.step}</div>
                  <span className="text-slate-700 text-sm">{s.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
            <p className="text-amber-700 text-xs">
              <span className="font-bold">亮点：</span>三线表符合 GB/T 7714 国标规范，含统计检验字母上标和 ANOVA 结果
            </p>
          </div>
        </motion.div>
      </div>
    ),
  },

  // ── 价值层：建立信任 (Slides 10-14) ──

  // Slide 10：对实验室的价值（前移）
  {
    id: "lab-value",
    title: "对实验室来说，这有什么用？",
    subtitle: "",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            icon: Library, title: "知识资产化",
            desc: "实验室积累的论文不是堆在硬盘里——导入系统变成可检索的知识库。论文越多，AI写得越准。这是通用平台做不到的。",
          },
          {
            icon: Wheat, title: "领域深度壁垒",
            desc: "通用平台要服务几十个学科，只能给通用方案。我们的每一条写作规则都是为农业论文写的——从实验设计到数据分析到学术表达。",
          },
          {
            icon: TrendingUp, title: "越用越聪明",
            desc: "每篇新论文加进去，知识库就更丰富。每个老师的反馈，都能用来改进写作规则。这是一个会成长的系统。",
          },
        ].map((v, i) => (
          <motion.div key={i} variants={itemVariants}
            className="p-8 bg-white rounded-3xl border border-slate-200 text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto">
              <v.icon className="w-8 h-8 text-emerald-600" />
            </div>
            <h4 className="font-bold text-xl text-slate-900">{v.title}</h4>
            <p className="text-slate-500 text-sm leading-relaxed">{v.desc}</p>
          </motion.div>
        ))}
      </div>
    ),
  },

  // Slide 11：差距分析（融入能力总览数据）
  {
    id: "gap",
    title: "从「AI辅助写作」到「可发表论文」",
    subtitle: "中间缺的不是技术，是系统工程",
    content: (
      <div className="space-y-6">
        <motion.div variants={itemVariants} className="relative">
          <div className="flex items-center gap-0">
            <div className="flex-1 h-4 bg-emerald-500 rounded-l-full" />
            <div className="flex-[2] h-4 bg-amber-400" />
            <div className="flex-[4] h-4 bg-slate-200 rounded-r-full" />
          </div>
          <div className="flex justify-between mt-3">
            <div className="text-center">
              <p className="font-bold text-emerald-600 text-lg">当前阶段</p>
              <p className="text-xs text-slate-500">辅助写作原型</p>
              <p className="text-[10px] text-slate-400">4 月下旬启动</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-amber-600 text-lg">半自动化</p>
              <p className="text-xs text-slate-500">初稿质量接近投稿水平</p>
              <p className="text-[10px] text-slate-400">预计 3 个月</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-slate-400 text-lg">可发表</p>
              <p className="text-xs text-slate-500">投稿即审稿</p>
              <p className="text-[10px] text-slate-400">预计 6 个月</p>
            </div>
          </div>
        </motion.div>
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100">
            <p className="font-bold text-emerald-800 mb-2">已经做到的</p>
            <div className="space-y-1.5">
              {["完整的 IMRAD 论文结构", "910篇农业论文知识库（6领域/2.6GB）", "Writer→Verifier→Refiner 三阶段", "6维度质量审查 + 查重改写", "15种图表 + 多格式导出"].map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4 flex-shrink-0" />{s}</div>
              ))}
            </div>
          </div>
          <div className="p-5 bg-amber-50 rounded-2xl border border-amber-100">
            <p className="font-bold text-amber-800 mb-2">还需要解决的</p>
            <div className="space-y-1.5">
              {["AI 痕迹检测与消除", "投前自检报告", "期刊级格式精准适配", "多轮修改迭代记忆", "图表-正文数据闭环验证", "实验设计合理性审查"].map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-amber-700"><Clock className="w-4 h-4 flex-shrink-0" />{s}</div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    ),
  },

  // Slide 12：路线图
  {
    id: "roadmap",
    title: "下一步怎么走",
    subtitle: "6 个月，三个阶段，从「能写」到「能投」",
    content: (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              phase: "第一阶段",
              time: "5/19 – 7/15（8 周）",
              goal: "写作质量 + 核心体验",
              items: [
                "AI 痕迹检测（禁用词/重复句式/等长段落）",
                "投前自检报告（Overclaim/Methods/引用一致性）",
                "批量扩写（多子节排队生成）",
                "图表-正文联动校验",
                "进度恢复 + 撤销/重做",
                "VPS 部署 + 真实课题验证",
              ],
              color: "emerald" as const,
            },
            {
              phase: "第二阶段",
              time: "7/16 – 9/15（8 周）",
              goal: "数据证据 + 基础设施",
              items: [
                "多文件分析（多CSV跨文件对比）",
                "风格校准（模仿已发表论文句式）",
                "NLI 语义引文事实核查",
                "Prisma 正式 migration",
                "API 请求队列 + 离线降级",
                "使用统计面板",
              ],
              color: "blue" as const,
            },
            {
              phase: "第三阶段",
              time: "9/16 – 11/15（8 周）",
              goal: "打磨发布 v3.0",
              items: [
                "多期刊模板适配（新增 1~2 种）",
                "夜间模式 / 专注模式",
                "领域专属写作规则细化",
                "全流程回归测试（5 个课题）",
                "bug 修复 + 性能优化",
                "v3.0 正式发布 + 实验室培训",
              ],
              color: "purple" as const,
            },
          ].map((p, i) => {
            const cmap = {
              emerald: { bg: "bg-emerald-50", border: "border-emerald-200", badge: "bg-emerald-500 text-white", dot: "bg-emerald-400", title: "text-emerald-700" },
              blue: { bg: "bg-blue-50", border: "border-blue-200", badge: "bg-blue-500 text-white", dot: "bg-blue-400", title: "text-blue-700" },
              purple: { bg: "bg-purple-50", border: "border-purple-200", badge: "bg-purple-500 text-white", dot: "bg-purple-400", title: "text-purple-700" },
            };
            const c = cmap[p.color];
            return (
              <motion.div key={i} variants={itemVariants}
                className={`${c.bg} ${c.border} border rounded-2xl p-5 flex flex-col gap-3`}>
                <div>
                  <h4 className={`font-black text-sm ${c.title}`}>{p.phase}</h4>
                  <Badge className={c.badge + " border-0 text-[10px] mt-1.5"}>{p.time}</Badge>
                </div>
                <Badge className="self-start border-0 bg-white text-slate-700 text-[10px]">目标：{p.goal}</Badge>
                <ul className="space-y-1.5 flex-1">
                  {p.items.map((it, j) => (
                    <li key={j} className="flex items-start gap-1.5 text-xs text-slate-600">
                      <div className={`w-1 h-1 rounded-full ${c.dot} flex-shrink-0 mt-1.5`} />{it}
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>
        <motion.div variants={itemVariants} className="text-center">
          <Link href="/roadmap">
            <Button variant="outline" className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-sm">
              查看详细推进计划（含每周任务分解）
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </motion.div>
      </div>
    ),
  },

  // Slide 13：需要的支持
  {
    id: "support",
    title: "要让这个系统真正有用，我需要——",
    subtitle: "",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div variants={itemVariants} className="space-y-4">
          {[
            { need: "更多农业论文PDF", why: "知识库越大，写作质量越高。这是系统最核心的资产。", priority: "最需要" },
            { need: "领域老师的使用反馈", why: "哪里写得不好、哪里不合规范——需要专家意见来改进。", priority: "最需要" },
            { need: "3-5 个真实课题验证", why: "用不同方向的真课题跑通全流程，验证系统的通用性。", priority: "很需要" },
          ].map((item, i) => (
            <div key={i} className="p-5 bg-white rounded-2xl border border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-900">{item.need}</span>
                <Badge className="bg-rose-100 text-rose-700 border-0 text-[10px]">{item.priority}</Badge>
              </div>
              <p className="text-slate-500 text-sm">{item.why}</p>
            </div>
          ))}
        </motion.div>
        <motion.div variants={itemVariants} className="space-y-4">
          <div className="p-6 bg-slate-900 rounded-3xl text-white space-y-5">
            <h4 className="text-lg font-bold">诚实地说——</h4>
            <p className="text-slate-300 text-sm leading-relaxed">
              这不是一个「已经做好了」的产品。<br />
              这是一个证明了<span className="text-emerald-400 font-bold">「方向可行」</span>的原型。
            </p>
            <p className="text-slate-300 text-sm leading-relaxed">
              商业平台有几十人的团队、数年的积累。我一个人在一个多月里，把最核心的写作工作流跑通了。
            </p>
            <p className="text-slate-300 text-sm leading-relaxed">
              接下来需要的是：<span className="text-white font-bold">数据、反馈、时间</span>——这三样到位，我有信心把它做成农业领域最好用的论文写作工具。
            </p>
          </div>
        </motion.div>
      </div>
    ),
  },

  // Slide 14：感谢页
  {
    id: "thanks",
    title: "",
    content: (
      <div className="flex flex-col items-center justify-center text-center space-y-10">
        <motion.div variants={itemVariants}>
          <Wheat className="w-20 h-20 text-emerald-600" />
        </motion.div>
        <motion.div variants={itemVariants} className="space-y-4">
          <h1 className="text-6xl md:text-7xl font-black tracking-tight text-slate-900">感谢聆听</h1>
          <p className="text-xl text-slate-500">欢迎提问和试用</p>
        </motion.div>
        <motion.div variants={itemVariants} className="flex gap-4 pt-8">
          <Link href="/workbench">
            <Button size="lg" className="h-14 px-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl shadow-lg shadow-emerald-100 transition-all hover:scale-105 active:scale-95">
              进入工作台 <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
          <Link href="/">
            <Button size="lg" variant="outline" className="h-14 px-8 border-slate-200 text-slate-500 rounded-2xl hover:bg-slate-50">
              返回首页
            </Button>
          </Link>
        </motion.div>
        <p className="text-slate-400 font-mono text-[10px] tracking-[0.4em] uppercase pt-16">GrainScript · v2.1.0 · Agricultural AI Research</p>
      </div>
    ),
  },
];

// ================================================================
// Main Component
// ================================================================

export default function PresentationPage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);

  const nextSlide = useCallback(() => setCurrentSlide((prev) => (prev + 1) % slides.length), []);
  const prevSlide = useCallback(() => setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") nextSlide();
      if (e.key === "ArrowLeft") prevSlide();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextSlide, prevSlide]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAutoPlaying) interval = setInterval(nextSlide, 15000);
    return () => clearInterval(interval);
  }, [isAutoPlaying, nextSlide]);

  const slide = slides[currentSlide];

  const tagMap: Record<string, string> = {
    "pain-points": "问题分析", "before-after": "效率对比",
    "modules": "系统总览", "workflow": "完整流程",
    "knowledge-1": "知识库", "writing-1": "写作引擎",
    "quality": "质量保障", "charts": "图表工具",
    "lab-value": "实验室价值", "gap": "差距分析",
    "roadmap": "路线图", "support": "需要的支持",
  };

  return (
    <div className="min-h-screen w-full flex flex-col overflow-hidden bg-[#f8fafc] text-slate-900 selection:bg-emerald-100 selection:text-emerald-900">
      <AgriBackground />

      {/* Header */}
      <motion.header
        initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="fixed top-0 left-0 w-full p-6 z-50 flex items-center justify-between pointer-events-none"
      >
        <div className="pointer-events-auto">
          <span className="text-[10px] font-mono text-slate-400 font-bold tracking-widest">GRAINSCRIPT</span>
        </div>
        <div className="flex items-center gap-6 pointer-events-auto">
          <div className="hidden md:flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-slate-400 font-bold">{currentSlide + 1}/{slides.length}</span>
              <div className="w-32 h-1 bg-slate-100 rounded-full overflow-hidden">
                <motion.div className="h-full bg-emerald-500"
                  animate={{ width: `${((currentSlide + 1) / slides.length) * 100}%` }}
                  transition={{ type: "spring", stiffness: 60, damping: 20 }} />
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm"
            className={`text-[10px] font-bold uppercase tracking-widest h-7 ${isAutoPlaying ? "text-emerald-600 bg-emerald-50" : "text-slate-400 hover:text-slate-600"}`}
            onClick={() => setIsAutoPlaying(!isAutoPlaying)}>
            {isAutoPlaying ? "Auto-Play" : "Manual"}
          </Button>
          <div className="w-px h-3 bg-slate-200" />
          <Link href="/"><Button variant="ghost" size="sm" className="text-[10px] font-bold text-slate-400 hover:text-slate-900 uppercase tracking-widest h-7">Exit</Button></Link>
        </div>
      </motion.header>

      {/* Main Slide */}
      <main className="flex-1 flex items-center justify-center p-8 md:p-16 lg:p-20 relative">
        <AnimatePresence mode="wait">
          <motion.div key={slide.id} variants={slideVariants} initial="initial" animate="animate" exit="exit"
            className="w-full max-w-7xl h-full flex flex-col justify-center">
            {slide.id !== "cover" && slide.id !== "thanks" && (
              <motion.div variants={itemVariants} className="mb-8 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="h-0.5 w-8 bg-emerald-500 rounded-full" />
                  <span className="text-emerald-600 font-mono text-[10px] font-bold tracking-[0.3em] uppercase">
                    {tagMap[slide.id] || ""}
                  </span>
                </div>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">{slide.title}</h2>
                {slide.subtitle && <p className="text-lg text-slate-500">{slide.subtitle}</p>}
              </motion.div>
            )}
            <div className="flex-1 flex flex-col justify-center">{slide.content}</div>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Navigation */}
      <div className="fixed bottom-0 left-0 w-full p-8 z-50 flex justify-between items-center pointer-events-none">
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1 }}>
          <Button variant="ghost" size="icon"
            className="w-12 h-12 rounded-2xl bg-white border border-slate-100 text-slate-400 pointer-events-auto hover:bg-slate-50 shadow-sm transition-all active:scale-90"
            onClick={prevSlide}><ChevronLeft className="w-6 h-6" /></Button>
        </motion.div>
        <div className="flex gap-3 pointer-events-auto items-center">
          {slides.map((_, idx) => (
            <button key={idx}
              className={`transition-all duration-500 ${idx === currentSlide ? "w-6 h-1.5 bg-emerald-500 rounded-full" : "w-1.5 h-1.5 bg-slate-200 rounded-full hover:bg-slate-300"}`}
              onClick={() => setCurrentSlide(idx)} />
          ))}
        </div>
        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1 }}>
          <Button variant="ghost" size="icon"
            className="w-12 h-12 rounded-2xl bg-emerald-600 text-white pointer-events-auto hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all hover:scale-110 active:scale-95"
            onClick={nextSlide}><ChevronRight className="w-6 h-6" /></Button>
        </motion.div>
      </div>
    </div>
  );
}
