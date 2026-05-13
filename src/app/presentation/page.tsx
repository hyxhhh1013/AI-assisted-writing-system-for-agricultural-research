"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ChevronLeft, 
  ChevronRight,
  FileText,
  Database, 
  PenTool, 
  BarChart3, 
  ShieldCheck, 
  Download, 
  Cpu, 
  Search, 
  CheckCircle2, 
  HelpCircle,
  Layout,
  Beaker,
  Layers,
  Zap,
  ArrowRight,
  Target,
  Users,
  Sparkles,
  BookOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AgriBackground } from "@/components/ui/AgriBackground";
import { GlassCard } from "@/components/ui/GlassCard";
import Link from "next/link";

// --- Variants ---

const slideVariants = {
  initial: { opacity: 0, scale: 0.98 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1] as const,
      staggerChildren: 0.1
    }
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: { duration: 0.3, ease: "easeInOut" as const }
  }
} as const;

const itemVariants = {
  initial: { opacity: 0, y: 15 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } }
} as const;

// --- Types ---

interface SlideContent {
  id: string;
  title: string;
  subtitle?: string;
  content: React.ReactNode;
}

// --- Slides Data ---

const slides: SlideContent[] = [
  // Slide 1: Welcome
  {
    id: "welcome",
    title: "论文智能助手",
    subtitle: "让 AI 懂科研，让写作更纯粹",
    content: (
      <div className="flex flex-col items-center justify-center text-center space-y-10">
        <motion.div variants={itemVariants} className="relative group">
          <div className="absolute inset-0 bg-emerald-100 blur-[40px] rounded-full group-hover:bg-emerald-200 transition-colors" />
          <div className="relative p-10 bg-white rounded-[2rem] border border-emerald-100 shadow-xl group-hover:shadow-2xl transition-all duration-500">
            <Beaker className="w-20 h-20 text-emerald-600" />
          </div>
        </motion.div>
        
        <div className="space-y-4">
          <motion.h1 
            variants={itemVariants} 
            className="text-7xl md:text-8xl font-black tracking-tighter text-slate-900 h-[155px] flex items-center"
          >
            禾书耕文 | GrainScript
          </motion.h1>
          <motion.p variants={itemVariants} className="text-xl md:text-2xl text-slate-500 font-normal">
            基于 RAG 的农业科研论文全生命周期辅助系统
          </motion.p>
        </div>

        <motion.div variants={itemVariants} className="flex flex-col items-center gap-6 pt-10">
          <div className="flex items-center gap-4">
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 px-6 py-2 rounded-full text-lg font-medium">
              汇报人：黄奕轩
            </Badge>
          </div>
          <p className="text-slate-400 font-mono tracking-widest text-xs uppercase">Agricultural AI Research • 2026</p>
        </motion.div>
      </div>
    ),
  },
  // Slide 2: The Core Problem
  {
    id: "problem",
    title: "科研写作的“隐形枷锁”",
    subtitle: "80% 的时间被 20% 的机械劳动占据",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <motion.div variants={itemVariants} className="space-y-8">
          <div className="p-8 bg-white border border-slate-100 rounded-3xl shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
            <p className="text-2xl md:text-3xl leading-relaxed text-slate-700 italic font-medium">
              "一篇高质量 SCI 论文的背后，是动辄 <span className="text-emerald-600 font-bold underline decoration-emerald-200 underline-offset-4">3-6 个月</span> 的重复劳动：查阅、降重、绘图与格式校验。"
            </p>
          </div>
          <div className="flex items-center gap-4 text-slate-500">
            <Target className="text-emerald-500" />
            <p className="text-xl">我们的目标：<span className="text-slate-900 font-semibold">将机械劳动降至最低，让创新思考回归中心。</span></p>
          </div>
        </motion.div>
        
        <div className="grid grid-cols-1 gap-4">
          {[
            { icon: Search, title: "知识焦虑", desc: "在海量文献中艰难寻找支撑论点" },
            { icon: FileText, title: "表达瓶颈", desc: "难以将实验数据转化为地道的学术语言" },
            { icon: ShieldCheck, title: "校验成本", desc: "繁琐的引用核对与一致性审查" },
          ].map((item, idx) => (
            <GlassCard key={idx} delay={idx * 0.1} className="flex items-center gap-6 py-6 px-8">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400">
                <item.icon className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-slate-900">{item.title}</h4>
                <p className="text-slate-500 text-sm">{item.desc}</p>
              </div>
            </GlassCard>
          ))}
        </div>
      </div>
    ),
  },
  // Slide 3: Workflow
  {
    id: "workflow",
    title: "全流程智能辅助",
    subtitle: "从第一篇文献到最后一项引用",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { 
            step: "01", title: "文献知识库", icon: Database, color: "text-blue-500", 
            features: ["PDF 批量上传与索引", "AI 划词翻译与专业解析", "文献深度问答 (RAG)"] 
          },
          { 
            step: "02", title: "智能写作引擎", icon: PenTool, color: "text-emerald-500", 
            features: ["章节感知扩写策略", "自动图表插入与配图", "大纲一键生成与调整"] 
          },
          { 
            step: "03", title: "质量保障体系", icon: ShieldCheck, color: "text-purple-500", 
            features: ["引用真实性逐条核查", "跨章节逻辑一致性检查", "AI 降重与格式标准化"] 
          },
        ].map((item, idx) => (
          <GlassCard key={idx} delay={idx * 0.1} className="flex flex-col gap-6 p-8 relative">
            <div className="absolute top-4 right-4 text-4xl font-black text-slate-50 opacity-10 font-mono">{item.step}</div>
            <div className={`w-14 h-14 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center ${item.color}`}>
              <item.icon className="w-7 h-7" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900">{item.title}</h3>
            <ul className="space-y-4">
              {item.features.map((f, i) => (
                <li key={i} className="flex items-center gap-3 text-slate-500 text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {f}
                </li>
              ))}
            </ul>
          </GlassCard>
        ))}
      </div>
    ),
  },
  // Slide 4: Specialized Tools
  {
    id: "tools",
    title: "集成科研工具箱",
    subtitle: "不仅写得快，更要画得准",
    content: (
      <div className="space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-8">
            <motion.div variants={itemVariants} className="p-8 bg-emerald-50 border border-emerald-100 rounded-3xl">
              <h4 className="text-xl font-bold text-emerald-800 mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5" /> 核心特色：XRD 实验室
              </h4>
              <p className="text-emerald-700/80 leading-relaxed">
                专门针对材料学、土壤学设计的 XRD 分析工具，支持峰拟合、晶胞可视化与 Bragg 计算，分析结果一键转化为学术语言并自动配图。
              </p>
            </motion.div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { t: "通用图表", i: BarChart3 },
                { t: "流程图绘图", i: Layers },
                { t: "分子结构图", i: Beaker },
                { t: "机理图生成", i: Zap },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                  <item.i className="w-5 h-5 text-slate-400" />
                  <span className="text-slate-700 font-medium">{item.t}</span>
                </div>
              ))}
            </div>
          </div>
          <motion.div variants={itemVariants} className="bg-slate-900 rounded-3xl p-8 text-slate-300 font-mono text-sm relative overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
              </div>
              <span className="text-[10px] text-slate-600 uppercase tracking-widest">Scientific Drawing Engine</span>
            </div>
            <div className="space-y-6">
              <div className="flex justify-between items-center text-emerald-400">
                <span>{">"} Analyzing XRD peaks...</span>
                <span className="animate-pulse">DONE</span>
              </div>
              <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700 flex flex-col items-center gap-4 py-10">
                <div className="w-full h-24 bg-gradient-to-t from-emerald-500/20 to-transparent relative">
                  <motion.div 
                    className="absolute inset-0 border-t-2 border-emerald-500" 
                    animate={{ y: [0, 5, 0] }} 
                    transition={{ repeat: Infinity, duration: 2 }}
                  />
                </div>
                <span className="text-xs text-slate-500">Peak Fitting Result: R-wp = 3.4%</span>
              </div>
              <div className="text-xs text-slate-500 leading-relaxed italic">
                "Fig 3. XRD patterns of the synthesized samples, showing well-defined diffraction peaks..."
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    ),
  },
  // Slide 5: Multi-Agent Architecture
  {
    id: "architecture",
    title: "学术严谨性的基石",
    subtitle: "Writer-Verifier-Refiner 多智能体协作",
    content: (
      <div className="space-y-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { role: "Writer", model: "DeepSeek", desc: "负责初稿撰写", detail: "深度检索文献，组织逻辑架构" },
            { role: "Verifier", model: "智谱 AI", desc: "负责事实核查", detail: "逐条校验引用，防止 AI 幻觉" },
            { role: "Refiner", model: "System", desc: "负责优化修正", detail: "根据审查意见，精准打磨语言" },
          ].map((item, i) => (
            <GlassCard key={i} className="flex flex-col items-center text-center gap-6 p-8 group">
              <div className="w-20 h-20 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
                {i === 0 ? <PenTool className="w-8 h-8 text-blue-500" /> : i === 1 ? <ShieldCheck className="w-8 h-8 text-emerald-500" /> : <Sparkles className="w-8 h-8 text-purple-500" />}
              </div>
              <div>
                <h4 className="text-xl font-bold text-slate-900 mb-1">{item.role}</h4>
                <Badge variant="outline" className="text-[10px] text-slate-400 mb-3">{item.model}</Badge>
                <p className="text-slate-900 font-semibold mb-2">{item.desc}</p>
                <p className="text-slate-500 text-xs leading-relaxed">{item.detail}</p>
              </div>
            </GlassCard>
          ))}
        </div>
        <motion.div variants={itemVariants} className="p-6 bg-slate-50 border border-slate-100 rounded-2xl text-center">
          <p className="text-slate-600 text-sm italic">
            学术依据：Chain-of-Verification (CoVe) 框架，有效降低大模型事实性错误达 40% 以上。
          </p>
        </motion.div>
      </div>
    ),
  },
  // Slide 6: RAG Strategy
  {
    id: "rag",
    title: "检索增强生成 (RAG)",
    subtitle: "从“通用对话”进化为“领域专家”",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div className="space-y-8">
          <div className="p-8 bg-white border border-slate-100 rounded-3xl shadow-sm">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold italic">R</div>
              <h4 className="text-2xl font-bold text-slate-900">不仅是记忆，更是检索</h4>
            </div>
            <p className="text-slate-600 leading-relaxed mb-6">
              系统不再盲目猜测，而是通过 <span className="text-emerald-600 font-bold">BM25 + 向量语义混合检索</span>，从你的专属文献库中精准提取知识片段。
            </p>
            <div className="space-y-3">
              {["100% 引用可追溯", "章节感知动态检索", "防止单篇文献过度主导"].map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-slate-800 font-medium">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="relative">
          <GlassCard className="p-8 space-y-6">
            <h4 className="font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" /> 协作模型
            </h4>
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-xs text-slate-500 mb-2 uppercase tracking-tighter">Human Input</p>
                <p className="text-slate-800 font-medium text-sm">"描述生物质热解的动力学过程..."</p>
              </div>
              <div className="flex justify-center"><ArrowRight className="rotate-90 text-slate-300" /></div>
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                <p className="text-xs text-emerald-600 mb-2 uppercase tracking-tighter">AI Knowledge Retrieval</p>
                <div className="flex gap-2">
                  <Badge className="bg-emerald-500 text-[10px]">Reference [1]</Badge>
                  <Badge className="bg-emerald-500 text-[10px]">Reference [4]</Badge>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    ),
  },
  // Slide 7: QA & Value
  {
    id: "qa",
    title: "常见疑虑与核心价值",
    subtitle: "关于产品的深度思考",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[
          { q: "引用真的可靠吗？", a: "我们通过 Verifier 引擎进行双向校验，只有原文中明确存在的观点才会被允许标注引用。任何疑似幻觉的内容都会被强制标记人工介入。" },
          { q: "这会助长学术作弊吗？", a: "不。本系统定位为“科研加速器”。它替代的是文献检索与语言润色的机械过程，而非科学思想本身。我们鼓励用户深度参与大纲与逻辑的把控。" },
          { q: "支持多语言环境吗？", a: "完全支持。支持中英文互译写作，内置 SCI/Nature/IEEE 等多种主流学术期刊排版模板。" },
          { q: "未来演进方向？", a: "我们将引入更强大的多模态 RAG，支持直接解析实验原始波谱数据，并提供更精细的学术逻辑冲突检测。" },
        ].map((item, idx) => (
          <GlassCard key={idx} className="p-8 group">
            <h4 className="text-lg font-bold text-slate-900 mb-3 flex items-start gap-3">
              <HelpCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-1 opacity-60 group-hover:opacity-100 transition-opacity" />
              {item.q}
            </h4>
            <p className="text-slate-500 text-sm leading-relaxed pl-8">{item.a}</p>
          </GlassCard>
        ))}
      </div>
    ),
  },
  // Slide 8: Future
  {
    id: "future",
    title: "感谢您的关注",
    subtitle: "开启高效科研新征程",
    content: (
      <div className="flex flex-col items-center justify-center text-center space-y-12">
        <motion.div variants={itemVariants} className="space-y-6">
          <h1 className="text-7xl font-bold tracking-tight text-slate-900">让我们共同进化</h1>
          <p className="text-2xl text-slate-500 font-light">科技赋能科研，效率成就未来</p>
        </motion.div>
        
        <motion.div variants={itemVariants} className="flex gap-4">
          <Link href="/workbench">
            <Button size="lg" className="h-14 px-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl shadow-lg shadow-emerald-100 transition-all hover:scale-105 active:scale-95">
              进入工作台 <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
          <Link href="/guide">
            <Button size="lg" variant="outline" className="h-14 px-8 border-emerald-200 text-emerald-700 rounded-2xl hover:bg-emerald-50 transition-all">
              <BookOpen className="mr-2 w-5 h-5" /> 使用指南
            </Button>
          </Link>
          <Link href="/">
            <Button size="lg" variant="outline" className="h-14 px-8 border-slate-200 text-slate-600 rounded-2xl hover:bg-slate-50 transition-all">
              返回首页
            </Button>
          </Link>
        </motion.div>

        <motion.div variants={itemVariants} className="pt-20">
          <p className="text-slate-400 font-mono text-[10px] tracking-[0.4em] uppercase">GrainScript Research Assistant • v2.1.0</p>
        </motion.div>
      </div>
    ),
  },
];

// --- Main Component ---

export default function PresentationPage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") nextSlide();
      if (e.key === "ArrowLeft") prevSlide();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextSlide, prevSlide]);

  // Auto-play effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAutoPlaying) {
      interval = setInterval(nextSlide, 10000); // 10 seconds per slide
    }
    return () => clearInterval(interval);
  }, [isAutoPlaying, nextSlide]);

  const slide = slides[currentSlide];

  return (
    <div className="min-h-screen w-full flex flex-col overflow-hidden bg-[#f8fafc] text-slate-900 selection:bg-emerald-100 selection:text-emerald-900">
      <AgriBackground />
      
      {/* Header */}
      <motion.header 
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed top-0 left-0 w-full p-8 z-50 flex items-center justify-end pointer-events-none"
      >

        <div className="flex items-center gap-8 pointer-events-auto">
          <div className="hidden md:flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-slate-400 font-bold">{currentSlide + 1} / {slides.length}</span>
              <div className="w-40 h-1 bg-slate-100 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-emerald-500"
                  animate={{ width: `${((currentSlide + 1) / slides.length) * 100}%` }}
                  transition={{ type: "spring", stiffness: 60, damping: 20 }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="sm" 
              className={`text-[10px] font-bold uppercase tracking-widest h-8 ${isAutoPlaying ? "text-emerald-600 bg-emerald-50" : "text-slate-400 hover:text-slate-600"}`}
              onClick={() => setIsAutoPlaying(!isAutoPlaying)}
            >
              {isAutoPlaying ? "Auto-Play On" : "Manual Mode"}
            </Button>
            <div className="w-px h-3 bg-slate-200" />
            <Link href="/">
              <Button variant="ghost" size="sm" className="text-[10px] font-bold text-slate-400 hover:text-slate-900 uppercase tracking-widest h-8">
                Exit
              </Button>
            </Link>
          </div>
        </div>
      </motion.header>

      {/* Main Slide Area */}
      <main className="flex-1 flex items-center justify-center p-10 md:p-24 lg:p-32 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            variants={slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="w-full max-w-7xl h-full flex flex-col justify-center"
          >
            {/* Slide Header */}
            {slide.id !== "welcome" && slide.id !== "future" && (
              <motion.div variants={itemVariants} className="mb-16 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-0.5 w-10 bg-emerald-500 rounded-full" />
                  <span className="text-emerald-600 font-mono text-[10px] font-bold tracking-[0.3em] uppercase">Phase 0{currentSlide}</span>
                </div>
                <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-slate-900">
                  {slide.title}
                </h2>
                {slide.subtitle && (
                  <p className="text-2xl text-slate-500 font-normal tracking-tight">
                    {slide.subtitle}
                  </p>
                )}
              </motion.div>
            )}

            {/* Slide Content */}
            <div className="flex-1 flex flex-col justify-center">
              {slide.content}
            </div>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Navigation Controls */}
      <div className="fixed bottom-0 left-0 w-full p-12 z-50 flex justify-between items-center pointer-events-none">
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1 }}>
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-16 h-16 rounded-2xl bg-white border border-slate-100 text-slate-400 pointer-events-auto hover:bg-slate-50 shadow-sm hover:shadow-md transition-all active:scale-90"
            onClick={prevSlide}
          >
            <ChevronLeft className="w-8 h-8" />
          </Button>
        </motion.div>
        
        <div className="flex gap-4 pointer-events-auto items-center">
          {slides.map((_, idx) => (
            <button
              key={idx}
              className={`transition-all duration-500 ${
                idx === currentSlide 
                  ? "w-8 h-1.5 bg-emerald-500 rounded-full" 
                  : "w-1.5 h-1.5 bg-slate-200 rounded-full hover:bg-slate-300"
              }`}
              onClick={() => setCurrentSlide(idx)}
            />
          ))}
        </div>

        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1 }}>
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-16 h-16 rounded-2xl bg-emerald-600 text-white pointer-events-auto hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all hover:scale-110 active:scale-95"
            onClick={nextSlide}
          >
            <ChevronRight className="w-8 h-8" />
          </Button>
        </motion.div>
      </div>

      {/* Decorative dots */}
      <div className="fixed inset-0 pointer-events-none opacity-40 overflow-hidden -z-10">
        <div className="absolute top-[10%] left-[5%] w-2 h-2 rounded-full bg-emerald-200" />
        <div className="absolute bottom-[20%] right-[10%] w-3 h-3 rounded-full bg-blue-200" />
        <div className="absolute top-[40%] right-[15%] w-1.5 h-1.5 rounded-full bg-purple-200" />
      </div>
    </div>
  );
}
