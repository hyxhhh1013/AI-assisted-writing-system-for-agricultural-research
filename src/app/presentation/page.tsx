"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, FileText, Database, PenTool,
  BarChart3, ShieldCheck, Download, Cpu, Search, CheckCircle2,
  HelpCircle, Layout, Beaker, Layers, Zap, ArrowRight,
  Target, Users, Sparkles, BookOpen, GitBranch, AlertTriangle,
  Clock, TrendingUp, Wrench, Library, ListChecks, ScanEye,
  MessageSquareText, NotebookPen, Globe, Microscope, Wheat,
  Link2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AgriBackground } from "@/components/ui/AgriBackground";
import { GlassCard } from "@/components/ui/GlassCard";
import Link from "next/link";

// --- Variants ---

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
// 20 张幻灯片 — 每张一个核心信息，可视化优先，面向农业科研人员
// ================================================================

function BigNum({ num, unit, label }: { num: string; unit?: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-5xl md:text-6xl font-black text-emerald-600 tracking-tight">
        {num}<span className="text-2xl text-emerald-400 ml-1">{unit || ""}</span>
      </p>
      <p className="text-sm text-slate-500 mt-2">{label}</p>
    </div>
  );
}

function StepCard({ step, title, desc, icon: Icon, color }: {
  step: string; title: string; desc: string; icon: React.ComponentType<{className?: string}>;
  color: { bg: string; border: string; text: string; icon: string };
}) {
  return (
    <div className={`flex items-start gap-4 p-5 rounded-2xl border ${color.border} ${color.bg}`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color.icon}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-[10px] font-mono text-slate-400 mb-0.5">{step}</p>
        <h4 className="font-bold text-slate-900 text-base">{title}</h4>
        <p className="text-slate-500 text-sm leading-relaxed mt-1">{desc}</p>
      </div>
    </div>
  );
}

// ================================================================
const slides: SlideContent[] = [
  // ── Slide 1: 封面 ──
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

  // ── Slide 2: 科研写作的"隐形工作量" ──
  {
    id: "pain-points",
    title: "写一篇论文，时间都花在哪了？",
    subtitle: "80% 的时间消耗在重复性劳动上",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
        {/* 左侧：三大痛点 */}
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
        {/* 右侧：饼图可视化 */}
        <motion.div variants={itemVariants} className="flex flex-col items-center">
          <div className="relative w-64 h-64">
            <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
              <circle cx="100" cy="100" r="80" fill="none" stroke="#f1f5f9" strokeWidth="30" />
              {/* 查文献 30% */}
              <circle cx="100" cy="100" r="80" fill="none" stroke="#f59e0b" strokeWidth="30"
                strokeDasharray={`${0.30 * 2 * Math.PI * 80} ${2 * Math.PI * 80}`} strokeLinecap="round" />
              {/* 写初稿 35% — offset by 30% */}
              <circle cx="100" cy="100" r="80" fill="none" stroke="#ef4444" strokeWidth="30"
                strokeDasharray={`${0.35 * 2 * Math.PI * 80} ${2 * Math.PI * 80}`}
                strokeDashoffset={`${-0.30 * 2 * Math.PI * 80}`} strokeLinecap="round" />
              {/* 核对 15% — offset by 65% */}
              <circle cx="100" cy="100" r="80" fill="none" stroke="#3b82f6" strokeWidth="30"
                strokeDasharray={`${0.15 * 2 * Math.PI * 80} ${2 * Math.PI * 80}`}
                strokeDashoffset={`${-0.65 * 2 * Math.PI * 80}`} strokeLinecap="round" />
              {/* 思考创新 20% */}
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

  // ── Slide 3: 传统方式 vs AI辅助 ──
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

  // ── Slide 4: 市面上已有科研AI平台 ──
  {
    id: "existing",
    title: "市面上已经有科研 AI 平台了",
    subtitle: "但它们做的是「通用型」，不是「农业专属」",
    content: (
      <div className="space-y-6">
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { name: "基金、论文写作", desc: "提供通用论文模板和AI辅助写作", icon: FileText },
            { name: "生信作图", desc: "生物学机制图、通路图", icon: Microscope },
            { name: "标书/课程", desc: "各类基金标书模板和写作课程", icon: BookOpen },
            { name: "科研工具集成", desc: "聚合多种科研工具的入口平台", icon: Layout },
          ].map((p, i) => (
            <div key={i} className="p-5 bg-white rounded-2xl border border-slate-100 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center mx-auto">
                <p.icon className="w-6 h-6 text-slate-400" />
              </div>
              <p className="font-bold text-slate-900 text-sm">{p.name}</p>
              <p className="text-slate-500 text-xs">{p.desc}</p>
            </div>
          ))}
        </motion.div>
        <motion.div variants={itemVariants} className="p-6 bg-amber-50 border border-amber-100 rounded-2xl text-center">
          <p className="text-amber-800 text-base">
            <span className="font-bold">关键问题：</span>
            这些平台服务医学、生物、材料等几十个学科，<br />
            <span className="text-amber-900 font-bold">没有一个专门为农业论文定制的。</span>
          </p>
        </motion.div>
      </div>
    ),
  },

  // ── Slide 5: 这些平台本质上做了什么 ──
  {
    id: "what-they-do",
    title: "它们本质上做了什么？",
    subtitle: "我用大白话翻译一下",
    content: (
      <div className="space-y-4">
        {[
          { emoji: "📚", plain: "建了一个「论文图书馆」", detail: "让 AI 能从真论文里找依据，而不是凭空编造", icon: Library, color: "bg-amber-50 border-amber-200 text-amber-700" },
          { emoji: "✍️", plain: "训练了一个「学术写作助手」", detail: "按论文章节结构，一段一段帮你写", icon: PenTool, color: "bg-blue-50 border-blue-200 text-blue-700" },
          { emoji: "🔍", plain: "配了一个「校对员」", detail: "帮你查引用有没有写错、数据前后对不对得上", icon: ScanEye, color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
          { emoji: "📊", plain: "内置了「画图工具」", detail: "实验数据传进去，图表直接出来", icon: BarChart3, color: "bg-purple-50 border-purple-200 text-purple-700" },
          { emoji: "📄", plain: "最后帮你「排版导出」", detail: "生成符合期刊要求的 PDF 或 Word 文档", icon: Download, color: "bg-slate-50 border-slate-200 text-slate-700" },
        ].map((item, i) => (
          <motion.div key={i} variants={itemVariants}
            className={`flex items-center gap-5 p-5 rounded-2xl border ${item.color}`}>
            <span className="text-3xl">{item.emoji}</span>
            <div className="flex-1">
              <h4 className="font-bold text-slate-900 text-lg">{item.plain}</h4>
              <p className="text-slate-500 text-sm">{item.detail}</p>
            </div>
          </motion.div>
        ))}
      </div>
    ),
  },

  // ── Slide 6: 我的思路 — 过渡页 ──
  {
    id: "my-approach",
    title: "参考这套思路，我做了一个「农业专属版」",
    subtitle: "",
    content: (
      <div className="flex flex-col items-center justify-center text-center space-y-8">
        <motion.div variants={itemVariants} className="relative">
          <div className="text-8xl">🌾</div>
        </motion.div>
        <motion.div variants={itemVariants}>
          <p className="text-3xl md:text-4xl font-bold text-slate-900 leading-relaxed max-w-2xl">
            同一套逻辑，<br />
            但<span className="text-emerald-600">全部针对农业论文</span>做了定制
          </p>
        </motion.div>
        <motion.div variants={itemVariants} className="flex gap-8 text-slate-500">
          <div className="text-center"><p className="text-3xl font-black text-emerald-600">910</p><p className="text-sm">篇农业论文</p></div>
          <div className="text-center"><p className="text-3xl font-black text-emerald-600">7</p><p className="text-sm">个研究领域</p></div>
          <div className="text-center"><p className="text-3xl font-black text-emerald-600">5</p><p className="text-sm">大核心模块</p></div>
        </motion.div>
      </div>
    ),
  },

  // ── Slide 7: 五大模块总览 ──
  {
    id: "modules",
    title: "系统由五大模块组成",
    subtitle: "每个模块对应论文写作的一个环节",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {[
          { num: "01", title: "知识库", desc: "把实验室的论文变成AI可检索的「专属图书馆」", icon: Library, color: "border-amber-300 bg-amber-50", dot: "bg-amber-500" },
          { num: "02", title: "写作引擎", desc: "按论文章节结构，一段一段自动生成初稿", icon: PenTool, color: "border-blue-300 bg-blue-50", dot: "bg-blue-500" },
          { num: "03", title: "质量检查", desc: "查引用、查数据、查措辞——写完之后全面「体检」", icon: ShieldCheck, color: "border-emerald-300 bg-emerald-50", dot: "bg-emerald-500" },
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

  // ── Slide 8: 知识库详解 — 你的专属论文图书馆 ──
  {
    id: "knowledge-1",
    title: "模块一：你的专属「论文图书馆」",
    subtitle: "AI 写论文不能凭空编——它需要从真论文里找依据",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
        <motion.div variants={itemVariants} className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100 text-center">
              <p className="text-4xl font-black text-amber-600">910</p>
              <p className="text-sm text-amber-700 mt-1">篇已索引论文</p>
            </div>
            <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 text-center">
              <p className="text-4xl font-black text-blue-600">7</p>
              <p className="text-sm text-blue-700 mt-1">个研究领域</p>
            </div>
            <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
              <p className="text-4xl font-black text-emerald-600">157</p>
              <p className="text-sm text-emerald-700 mt-1">MB 知识总量</p>
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
              { cat: "控释肥类", n: "—" }, { cat: "茶学", n: "—" },
              { cat: "烟草", n: "—" }, { cat: "热化学", n: "—" },
              { cat: "热解", n: "—" }, { cat: "烟花", n: "—" },
            ].map((c, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <span className="text-slate-700 text-sm font-medium">{c.cat}</span>
                <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">已索引</Badge>
              </div>
            ))}
          </GlassCard>
        </motion.div>
      </div>
    ),
  },

  // ── Slide 9: 知识库怎么检索 — 大白话版 ──
  {
    id: "knowledge-2",
    title: "知识库怎么找到对的文献？",
    subtitle: "两种方式的结合，比单一的更靠谱",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <motion.div variants={itemVariants} className="p-8 bg-amber-50 rounded-3xl border border-amber-200">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center mb-4">
            <Search className="w-7 h-7 text-amber-600" />
          </div>
          <h4 className="text-xl font-bold text-slate-900 mb-3">方式一：关键词匹配</h4>
          <p className="text-slate-600 text-sm leading-relaxed mb-4">
            就像在搜索引擎里输入关键词。你写「氮肥对水稻产量的影响」，系统会精确找到包含这些术语的论文段落。
          </p>
          <div className="p-3 bg-white rounded-xl border border-amber-100">
            <p className="text-xs text-amber-700 font-medium">例子：搜「控释肥」→ 找到所有提到控释肥的论文段落</p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="p-8 bg-blue-50 rounded-3xl border border-blue-200">
          <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mb-4">
            <Cpu className="w-7 h-7 text-blue-600" />
          </div>
          <h4 className="text-xl font-bold text-slate-900 mb-3">方式二：语义理解</h4>
          <p className="text-slate-600 text-sm leading-relaxed mb-4">
            即使用词不一样，AI 也能理解你的意思。你写「减施氮肥」，系统也能找到研究「氮肥减量」「节氮栽培」的论文。
          </p>
          <div className="p-3 bg-white rounded-xl border border-blue-100">
            <p className="text-xs text-blue-700 font-medium">例子：搜「氮肥减施」→ 也能找到写「节氮栽培」的论文</p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="md:col-span-2 p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-center">
          <p className="text-emerald-700 text-sm">
            <span className="font-bold">两种方式的结果合并排序</span>——既不会漏掉关键词精确匹配的论文，也不会错过意思相近但用词不同的研究
          </p>
        </motion.div>
      </div>
    ),
  },

  // ── Slide 10: 写作引擎 — 三步流程 ──
  {
    id: "writing-1",
    title: "模块二：AI 怎么写论文？",
    subtitle: "不是一次写完——而是「写→审→改」三步走",
    content: (
      <div className="space-y-6">
        {/* 三步流程大图 */}
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

        {/* 关键设计 */}
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

  // ── Slide 11: 写作规则 — 论文的标准答案 ──
  {
    id: "writing-2",
    title: "AI 按什么「规矩」写？",
    subtitle: "每一条规矩都是根据学术写作规范设定的",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div variants={itemVariants} className="space-y-4">
          <h4 className="font-bold text-slate-900 text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-500" /> 论文结构规则
          </h4>
          {[
            { section: "引言", rule: "五步推进：重要性→已知研究→研究缺口→本文目标→研究价值" },
            { section: "方法", rule: "写出来的步骤，另一个研究者照着做应该能重现你的实验" },
            { section: "结果", rule: "只报告观察到了什么，不解释原因（解释留给「讨论」章节）" },
            { section: "讨论", rule: "解释机制→对比已有研究→承认局限性——用推测句式，不说绝对话" },
            { section: "结论", rule: "每条结论必须有前面的数据支撑，不能凭空下结论" },
          ].map((r, i) => (
            <div key={i} className="p-4 bg-white rounded-xl border border-slate-100">
              <span className="text-emerald-600 font-bold text-sm">{r.section}：</span>
              <span className="text-slate-600 text-sm">{r.rule}</span>
            </div>
          ))}
        </motion.div>

        <motion.div variants={itemVariants} className="space-y-4">
          <h4 className="font-bold text-slate-900 text-lg flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-500" /> 措辞安全规则
          </h4>
          <div className="p-5 bg-rose-50 rounded-2xl border border-rose-100">
            <p className="text-rose-700 font-bold text-sm mb-3">AI 被禁止使用的措辞：</p>
            <div className="flex flex-wrap gap-2">
              {["首次", "证明", "最优", "最好", "前所未有", "填补了空白"].map(w => (
                <Badge key={w} className="bg-rose-100 text-rose-700 border-0">{w}</Badge>
              ))}
            </div>
            <p className="text-rose-600 text-xs mt-3">这些词过度夸大，在学术论文中不严谨</p>
          </div>
          <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100">
            <p className="text-emerald-700 font-bold text-sm mb-3">AI 被要求使用的措辞：</p>
            <div className="flex flex-wrap gap-2">
              {["表明", "提示", "与…一致", "可能反映", "尚需验证"].map(w => (
                <Badge key={w} className="bg-emerald-100 text-emerald-700 border-0">{w}</Badge>
              ))}
            </div>
            <p className="text-emerald-600 text-xs mt-3">用科学的态度表达结论，留有余地</p>
          </div>
        </motion.div>
      </div>
    ),
  },

  // ── Slide 12: 论文类型识别 ──
  {
    id: "paper-types",
    title: "不同类型的论文，AI 用不同的写法",
    subtitle: "农业论文主要分这几种，每种都有对应的叙事逻辑",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[
          { type: "田间/温室试验型", pct: "最常见", desc: "生产问题→试验设计→处理效应→产量/品质响应→机理探讨→生产建议", examples: "品种比较、施肥量、栽培方式等田间试验" },
          { type: "发现/机理型", pct: "常见", desc: "现象→未知机制→提出假设→实验验证→证据链→模型→局限性", examples: "重金属胁迫机制、酶活性调控路径" },
          { type: "方法/工具型", pct: "较常见", desc: "当前方法瓶颈→提出新方法→技术路线→性能对比→适用边界", examples: "新的检测方法、数据处理算法" },
        ].map((t, i) => (
          <motion.div key={i} variants={itemVariants} className="p-6 bg-white rounded-2xl border border-slate-200 flex flex-col gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-bold text-slate-900 text-base">{t.type}</h4>
                <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">{t.pct}</Badge>
              </div>
              <p className="text-slate-500 text-xs">{t.examples}</p>
            </div>
            <div className="flex-1 p-4 bg-slate-50 rounded-xl">
              <p className="text-slate-600 text-xs leading-relaxed">
                <span className="font-bold text-slate-700">叙事逻辑：</span>{t.desc}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    ),
  },

  // ── Slide 13: 质量检查体系 ──
  {
    id: "quality",
    title: "模块三：写完之后还要「体检」",
    subtitle: "六项检查，逐一过关",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: MessageSquareText, title: "术语一致性", desc: "品种名、处理代号、测定指标……全篇是否统一叫法", color: "bg-blue-50 border-blue-100" },
          { icon: BarChart3, title: "数据一致性", desc: "Results 里报的数字和 Discussion、Conclusion 里引用的对不对得上", color: "bg-emerald-50 border-emerald-100" },
          { icon: GitBranch, title: "逻辑连贯性", desc: "Introduction 提的问题 → Results 有没有回答 → Discussion 有没有解释", color: "bg-purple-50 border-purple-100" },
          { icon: AlertTriangle, title: "Overclaim 扫描", desc: "全文扫描：有没有「首次」「最优」等过度措辞", color: "bg-rose-50 border-rose-100" },
          { icon: Link2, title: "引用一致性", desc: "文中 [5] 和文献列表的第 5 条是不是同一篇", color: "bg-amber-50 border-amber-100" },
          { icon: Search, title: "数据溯源", desc: "每个数字和结论是否标注了数据来源", color: "bg-indigo-50 border-indigo-100" },
        ].map((item, i) => (
          <motion.div key={i} variants={itemVariants}
            className={`${item.color} border rounded-2xl p-5 flex flex-col gap-3`}>
            <item.icon className="w-8 h-8 text-slate-600" />
            <h4 className="font-bold text-slate-900">{item.title}</h4>
            <p className="text-slate-500 text-xs leading-relaxed">{item.desc}</p>
          </motion.div>
        ))}
      </div>
    ),
  },

  // ── Slide 14: 查重引擎 ──
  {
    id: "plagiarism",
    title: "查重 + 改写，双管齐下",
    subtitle: "先查哪里重复，再帮你改写",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <motion.div variants={itemVariants} className="space-y-5">
          <div className="p-6 bg-rose-50 rounded-2xl border border-rose-100">
            <div className="flex items-center gap-3 mb-3">
              <Search className="w-6 h-6 text-rose-500" />
              <h4 className="font-bold text-slate-900 text-lg">查重引擎</h4>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">
              把你的论文和知识库里的 910 篇论文做比对，标出相似段落和相似度。
              不是简单比字符串——AI 能识别「意思相同但换了说法」的段落。
            </p>
          </div>
          <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100">
            <div className="flex items-center gap-3 mb-3">
              <Wrench className="w-6 h-6 text-emerald-500" />
              <h4 className="font-bold text-slate-900 text-lg">三种改写策略</h4>
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
        <motion.div variants={itemVariants} className="p-8 bg-slate-50 rounded-3xl border border-slate-200 text-center">
          <p className="text-6xl mb-4">📋</p>
          <p className="text-slate-900 font-bold text-lg mb-2">查重 ≠ 鼓励抄袭</p>
          <p className="text-slate-500 text-sm leading-relaxed">
            这是一个安全网——帮你发现自己没意识到的重复表述。
            最终怎么改、改不改，由你决定。
          </p>
        </motion.div>
      </div>
    ),
  },

  // ── Slide 15: 图表系统 ──
  {
    id: "charts",
    title: "模块四：数据直接变图表",
    subtitle: "14 种图表类型，上传数据即可生成",
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

  // ── Slide 16: 完整流程演示 ──
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
          { step: "4", title: "逐节扩写初稿", time: "每节 30-60 秒", detail: "Writer AI 按章节写作规则生成内容，实时流式显示，不白屏等待", icon: PenTool, color: "border-emerald-200" },
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

  // ── Slide 17: 系统实际能力总览 ──
  {
    id: "capabilities",
    title: "这个系统现在到底能做什么？",
    subtitle: "用数字说话",
    content: (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { num: "37", unit: "条", label: "功能接口", sub: "覆盖写作全流程" },
            { num: "15", unit: "个", label: "功能页面", sub: "从写作到绘图到导出" },
            { num: "910", unit: "篇", label: "知识库论文", sub: "7 个农业研究领域" },
            { num: "14", unit: "种", label: "图表类型", sub: "含 XRD 分析 + 三线表" },
          ].map((s, i) => (
            <motion.div key={i} variants={itemVariants} className="p-6 bg-white rounded-2xl border border-slate-100 text-center">
              <p className="text-4xl font-black text-emerald-600">{s.num}<span className="text-xl text-emerald-400">{s.unit}</span></p>
              <p className="font-bold text-slate-900 mt-1">{s.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
            </motion.div>
          ))}
        </div>
        <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: FileText, label: "大纲自动生成" }, { icon: PenTool, label: "逐节AI扩写" },
            { icon: ScanEye, label: "引用真伪校验" }, { icon: ShieldCheck, label: "6维度一致性审查" },
            { icon: Search, label: "查重+改写" }, { icon: BarChart3, label: "数据自动配图" },
            { icon: Download, label: "PDF/Word导出" }, { icon: Globe, label: "中英互译" },
            { icon: BookOpen, label: "文献对话问答" }, { icon: Layers, label: "分子结构图" },
            { icon: Microscope, label: "XRD图谱分析" }, { icon: MessageSquareText, label: "PPT生成" },
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <f.icon className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span className="text-slate-700 text-xs font-medium">{f.label}</span>
            </div>
          ))}
        </motion.div>
      </div>
    ),
  },

  // ── Slide 18: 与商业平台的对比 ──
  {
    id: "comparison",
    title: "跟商业平台比一比",
    subtitle: "不是一个量级的比较——而是不同方向的比较",
    content: (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { label: "团队", biz: "几十人的公司团队", us: "1 个本科生", winner: null },
            { label: "时间", biz: "数年产品迭代", us: "约 2 个月开发", winner: null },
            { label: "领域适用", biz: "医学/生物/材料通用", us: "农业专属定制", winner: "us" },
            { label: "知识库", biz: "通用公开文献", us: "可加载你自己的论文", winner: "us" },
            { label: "写作规范", biz: "通用模板", us: "农业领域深度定制", winner: "us" },
            { label: "图表类型", biz: "种类丰富", us: "14 种 + 农业图表", winner: null },
            { label: "界面设计", biz: "专业设计师出品", us: "基础可用", winner: "biz" },
            { label: "功能数量", biz: "上百个工具", us: "聚焦论文全流程", winner: "biz" },
          ].map((row, i) => (
            <motion.div key={i} variants={itemVariants} className="p-5 bg-white rounded-2xl border border-slate-100">
              <p className="text-xs text-slate-400 font-bold mb-3 uppercase tracking-widest">{row.label}</p>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-[10px] text-slate-400 mb-0.5">商业平台</p>
                  <p className="text-slate-600 text-sm">{row.biz}</p>
                </div>
                <div className="flex-1 text-right">
                  <p className="text-[10px] text-emerald-500 mb-0.5">本项目</p>
                  <p className="text-emerald-700 text-sm font-medium">{row.us}</p>
                </div>
              </div>
              {row.winner && (
                <div className="mt-3 pt-3 border-t border-slate-50">
                  {row.winner === "us" ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">我们的优势方向</Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-500 border-0 text-[10px]">对方资源更强</Badge>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    ),
  },

  // ── Slide 19: 从「辅助」到「发表」的差距 ──
  {
    id: "gap",
    title: "从「AI辅助写作」到「可发表论文」",
    subtitle: "中间缺的不是技术，是系统工程",
    content: (
      <div className="space-y-6">
        <motion.div variants={itemVariants} className="relative">
          {/* 进度条 */}
          <div className="flex items-center gap-0">
            <div className="flex-1 h-4 bg-emerald-500 rounded-l-full" />
            <div className="flex-[2] h-4 bg-amber-400" />
            <div className="flex-[4] h-4 bg-slate-200 rounded-r-full" />
          </div>
          <div className="flex justify-between mt-3">
            <div className="text-center">
              <p className="font-bold text-emerald-600 text-lg">当前阶段</p>
              <p className="text-xs text-slate-500">辅助写作原型</p>
              <p className="text-[10px] text-slate-400">约 2 个月完成</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-amber-600 text-lg">半自动化</p>
              <p className="text-xs text-slate-500">初稿质量接近投稿水平</p>
              <p className="text-[10px] text-slate-400">预计 3-6 个月</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-slate-400 text-lg">可发表</p>
              <p className="text-xs text-slate-500">投稿即审稿</p>
              <p className="text-[10px] text-slate-400">预计 6-12 个月</p>
            </div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100">
            <p className="font-bold text-emerald-800 mb-2">已经做到的</p>
            <div className="space-y-1.5">
              {["完整的 IMRAD 论文结构", "910篇农业论文知识库", "Writer→Verifier→Refiner 三阶段", "6维度质量审查", "14种图表 + 格式导出"].map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4 flex-shrink-0" />{s}</div>
              ))}
            </div>
          </div>
          <div className="p-5 bg-amber-50 rounded-2xl border border-amber-100">
            <p className="font-bold text-amber-800 mb-2">还需要解决的</p>
            <div className="space-y-1.5">
              {["引用真实性100%核验", "实验设计合理性审查", "期刊级格式精准适配", "多轮修改迭代记忆", "同行评审模拟", "实验可重现性检查"].map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-amber-700"><Clock className="w-4 h-4 flex-shrink-0" />{s}</div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    ),
  },

  // ── Slide 20: 路线图 ──
  {
    id: "roadmap",
    title: "下一步怎么走",
    subtitle: "三个阶段，每个阶段有明确目标",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            phase: "近期", time: "1-2 个月", goal: "打磨闭环",
            items: ["用真实农业课题跑通全流程", "引用核验升级", "自动配图接入", "部署到公网可用"],
            color: "emerald" as const,
          },
          {
            phase: "中期", time: "3-6 个月", goal: "半自动化",
            items: ["实验设计建议引擎", "引文事实核查", "跨章节逻辑闭环", "多期刊模板适配"],
            color: "blue" as const,
          },
          {
            phase: "远期", time: "6-12 个月", goal: "初稿即投稿",
            items: ["AI同行评审模拟", "实验可重现性检查", "中英文双版同步", "导师-学生协作工作流"],
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
              className={`${c.bg} ${c.border} border rounded-2xl p-6 flex flex-col gap-4`}>
              <div className="flex items-center justify-between">
                <h4 className={`font-black text-xl ${c.title}`}>{p.phase}</h4>
                <Badge className={c.badge + " border-0 text-[10px]"}>{p.time}</Badge>
              </div>
              <Badge className="self-start border-0 bg-white text-slate-700 text-[10px]">目标：{p.goal}</Badge>
              <ul className="space-y-2.5 flex-1">
                {p.items.map((it, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-slate-600">
                    <div className={`w-1.5 h-1.5 rounded-full ${c.dot} flex-shrink-0 mt-2`} />{it}
                  </li>
                ))}
              </ul>
            </motion.div>
          );
        })}
      </div>
    ),
  },

  // ── Slide 21: 对实验室的价值 ──
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
            desc: "通用平台要服务几十个学科，只能给通用方案。我们的每一条写作规则都是为农业论文写的——田间试验设计、品种比较、产量响应。",
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

  // ── Slide 22: 需要的支持 ──
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
              商业平台有几十人的团队、数年的积累。我一个人在两个月里，把最核心的写作工作流跑通了。
            </p>
            <p className="text-slate-300 text-sm leading-relaxed">
              接下来需要的是：<span className="text-white font-bold">数据、反馈、时间</span>——这三样到位，我有信心把它做成农业领域最好用的论文写作工具。
            </p>
          </div>
        </motion.div>
      </div>
    ),
  },

  // ── Slide 23: 感谢页 ──
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
// Main Component — 保留原导航逻辑，只替换 slides
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

  // 可视化标签映射
  const tagMap: Record<string, string> = {
    "pain-points": "问题分析", "before-after": "效率对比", "existing": "行业现状",
    "what-they-do": "白话拆解", "my-approach": "我的思路", "modules": "系统总览",
    "knowledge-1": "知识库", "knowledge-2": "检索原理", "writing-1": "写作引擎",
    "writing-2": "写作规则", "paper-types": "论文类型", "quality": "质量检查",
    "plagiarism": "查重", "charts": "图表工具", "workflow": "完整流程",
    "capabilities": "能力总览", "comparison": "诚实对比", "gap": "差距分析",
    "roadmap": "路线图", "lab-value": "实验室价值", "support": "需要的支持",
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
            {slide.id !== "cover" && slide.id !== "thanks" && slide.id !== "my-approach" && (
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
