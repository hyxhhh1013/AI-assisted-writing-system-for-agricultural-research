"use client";

import React from "react";
import Link from "next/link";
import {
  Clock, Quote, Search, Lightbulb, Code2, Zap,
  CheckCircle2, PenTool, ShieldCheck, Wrench, Library, Microscope,
  Wheat, Building2, TrendingUp, Users, FileText, ExternalLink,
} from "lucide-react";
import { motion } from "framer-motion";
import { AnimatedCounter } from "./animated-counter";
import { WritingPipelineDemo } from "./writing-pipeline-demo";
import { FakeReferencesDemo } from "./fake-references-demo";
import { CitationCheckDemo } from "./citation-check-demo";
import { ProblemSolutionDemo } from "./problem-solution-demo";
import { ArchitectureDiagram } from "./architecture-diagram";
import { WhyTwoModels } from "./why-two-models";
import { QualityDimensions } from "./quality-dimensions";
import { LiveKnowledgeStats, LiveChartCount } from "./live-knowledge-stats";
import { usePresentationStats } from "./live-stats";

const E = [0.22, 1, 0.36, 1] as const;
const fade = (d = 0) => ({ initial: { opacity: 0, y: 32 }, animate: { opacity: 1, y: 0, transition: { duration: 0.65, delay: d, ease: E } } });
const Em = ({ children }: { children: React.ReactNode }) => <span className="text-emerald-400">{children}</span>;
const EmR = ({ children }: { children: React.ReactNode }) => <span className="text-rose-400">{children}</span>;

function T({ children, delay = 0, size = "5xl" }: { children: React.ReactNode; delay?: number; size?: string }) {
  const s = size === "9xl" ? "text-7xl md:text-9xl" : size === "7xl" ? "text-5xl md:text-7xl" : "text-4xl md:text-6xl";
  return <motion.h2 {...fade(delay)} className={`${s} font-black leading-[1.1] tracking-tight text-white text-center max-w-5xl`}>{children}</motion.h2>;
}

function P({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return <motion.p {...fade(delay)} className="text-xl md:text-2xl text-white/35 font-light tracking-wide text-center max-w-3xl">{children}</motion.p>;
}

function N({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return <motion.p {...fade(delay)} className="text-base md:text-lg text-white/40 font-light leading-relaxed text-center max-w-3xl">{children}</motion.p>;
}

function C({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return <motion.div {...fade(delay)} className="flex flex-col items-center text-center gap-2">{children}</motion.div>;
}

function R({ children, delay = 0, gap = "gap-16" }: { children: React.ReactNode; delay?: number; gap?: string }) {
  return <motion.div {...fade(delay)} className={`flex items-center justify-center ${gap} flex-wrap`}>{children}</motion.div>;
}

function B({ num, unit, delay = 0 }: { num: React.ReactNode; unit: string; delay?: number }) {
  return <motion.div {...fade(delay)} className="text-center"><p className="text-7xl md:text-8xl font-black text-white tracking-tight">{num}</p><p className="text-base text-white/30 font-light mt-2 tracking-wide">{unit}</p></motion.div>;
}

function X({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return <motion.p {...fade(delay)} className="text-sm text-white/25 font-light tracking-wide text-center">{children}</motion.p>;
}

export type Act = "hook" | "story" | "research" | "pain" | "solution" | "results" | "process" | "close";

export interface SlideContent { id: string; title: string; subtitle?: string; content: React.ReactNode; }

const DIRECTIONS = [
  "茶学", "烟草", "热化学", "控释肥类", "烟花", "水稻", "光-茶", "光-植物",
];

const PROMPT_HIGHLIGHTS = [
  "证据强度分级 · 禁止「首次」「证明」等过度措辞",
  "Results 句式铁律 · 客观报告，含统计检验和重复数",
  "Discussion 逻辑链 · 发现→机制→对比→局限→展望",
  "Overclaim 检测 · 全文扫描，避免「最优」「最好」",
];

/** 20 分钟主流程（约 25 页） */
export const slides: (SlideContent & { act: Act })[] = [
  // ── Hook ──
  { id: "cover", act: "hook", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-14">
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, ease: E }} className="relative">
        <motion.div animate={{ opacity: [0.15, 0.35, 0.15] }} transition={{ duration: 3, repeat: Infinity }} className="absolute inset-0 bg-emerald-400 blur-[120px] rounded-full scale-150" />
        <Wheat className="w-20 h-20 md:w-24 md:h-24 text-emerald-400 relative" />
      </motion.div>
      <div className="space-y-4">
        <motion.h1 {...fade(0.3)} className="text-7xl md:text-9xl font-black tracking-tighter text-white">禾书耕文</motion.h1>
        <motion.p {...fade(0.5)} className="text-2xl md:text-3xl text-emerald-400/50 font-light tracking-[0.25em]">GrainScript</motion.p>
      </div>
      <N delay={0.8}>一个大二学生用 AI 做的农业科研写作系统</N>
      <motion.div {...fade(1.2)} className="pt-12 space-y-1 text-center">
        <p className="text-base text-white/45">黄奕轩</p>
        <p className="text-xs text-white/20 tracking-[0.3em] uppercase">计算机科学与技术 · 2026.06</p>
      </motion.div>
    </div>
  )},

  { id: "hook-crisis", act: "hook", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-8 max-w-3xl">
      <motion.p {...fade(0)} className="text-2xl md:text-3xl text-white/60 font-light text-center">你做了三年试验，终于要写论文——</motion.p>
      <motion.p {...fade(0.4)} className="text-lg text-white/30 font-light text-center leading-relaxed">
        打开 AI，参考文献格式完美、DOI 齐全。<br />你心想：<span className="text-emerald-400/70">终于可以交差了。</span>
      </motion.p>
      <motion.div {...fade(1)} className="w-full h-px bg-white/10 my-2" />
      <motion.p {...fade(1.2)} className="text-4xl md:text-6xl font-black text-rose-400 text-center leading-tight">
        「参考文献 [3]<br />不存在，请核实。」
      </motion.p>
      <motion.p {...fade(1.6)} className="text-base text-white/35 font-light text-center">— 审稿人回信</motion.p>
      <N delay={2}>10 条引用，超过一半查不到。<span className="text-rose-400/70">到底还有多少是编的？</span></N>
      <X delay={2.4}>互动：你们觉得 10 条里，几条可能是假的？</X>
    </div>
  )},

  { id: "hook-evidence", act: "hook", title: "", content: (
    <div className="flex flex-col md:flex-row items-center justify-center gap-12 md:gap-20 max-w-5xl">
      <motion.div {...fade(0)} className="flex-1 text-center space-y-4">
        <p className="text-8xl md:text-9xl font-black leading-none text-white">8<span className="text-white/30">/</span>10</p>
        <P delay={0.2}>我的实测：ChatGPT 编造的引用</P>
        <N delay={0.5}>去年 12 月文献综述，格式完美——8 条不存在</N>
      </motion.div>
      <motion.div {...fade(0.3)} className="w-px h-32 bg-white/10 hidden md:block" />
      <motion.div {...fade(0.4)} className="flex-1 text-center space-y-4">
        <p className="text-8xl md:text-9xl font-black leading-none text-white"><Em>60</Em>–80<span className="text-2xl align-super">%</span></p>
        <P delay={0.2}>Nature (2024) 报告的概率</P>
        <motion.p {...fade(0.8)} className="text-lg text-white/45 font-light italic">看起来很专业。但<EmR>你不能信它</EmR>。</motion.p>
      </motion.div>
    </div>
  )},

  // ── Story ──
  { id: "origin-journey", act: "story", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-10">
      <T size="7xl">2025.12 → 2026.03</T>
      <P delay={0.2}>从「连 React 都不会」到 Trae 黑客松三等奖</P>
      <R delay={0.4} gap="gap-0">
        {[
          { d: "12月", t: "从零自学", s: "跟着 AI 学 React / Next.js" },
          { d: "1月", t: "第一个全栈", s: "个人网站 hyxhhh.site" },
          { d: "2月", t: "Trae 黑客松", s: "卓工院 × 字节跳动" },
          { d: "3月", t: "三等奖 🏆", s: "AI 原生能力被看见" },
        ].map((x, i, a) => (
          <React.Fragment key={i}>
            <C delay={0.5 + i * 0.12}>
              <p className="text-xs text-emerald-400/40 font-mono tracking-wider">{x.d}</p>
              <p className="text-base font-bold text-white mt-2">{x.t}</p>
              <p className="text-xs text-white/30 font-light mt-1 max-w-[120px]">{x.s}</p>
            </C>
            {i < a.length - 1 && <div className="w-8 h-px bg-white/10 mx-1" />}
          </React.Fragment>
        ))}
      </R>
      <X delay={1.4}>HTML/CSS/一点 JS 起步 · 独立部署在个人 VPS</X>
    </div>
  )},

  { id: "invitation", act: "story", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-12">
      <N delay={0}>获奖后，刘怡老师让徐智航联系了获奖同学</N>
      <motion.blockquote {...fade(0.8)} className="text-4xl md:text-6xl font-black text-white leading-tight text-center max-w-3xl">
        「要不要跟着我去筹建<Em>智慧农业创新中心</Em>？」
      </motion.blockquote>
      <motion.p {...fade(1.6)} className="text-xl text-white/25 font-light">— 周院长</motion.p>
      <X delay={2.4}>这个奖不是终点，是起点。</X>
    </div>
  )},

  { id: "research-trips", act: "story", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-10">
      <T size="7xl">跟着周院长，走进真实世界</T>
      <div className="grid grid-cols-2 gap-x-16 gap-y-8 max-w-3xl">
        {[
          { n: "山姆会员店", d: "终端零售标准 · 供应商数据库", I: Building2 },
          { n: "东升农场", d: "年产值 18 亿 · 人工采收", I: Wheat },
          { n: "红星农批", d: "年交易 700 亿", I: TrendingUp },
          { n: "大队长农业", d: "农机共享 · 产业协同", I: Users },
        ].map((x, i) => (
          <C key={i} delay={0.5 + i * 0.12}>
            <x.I className="w-7 h-7 text-emerald-400/40" />
            <p className="text-lg font-bold text-white mt-2">{x.n}</p>
            <p className="text-xs text-white/30 font-light mt-1">{x.d}</p>
          </C>
        ))}
      </div>
      <R delay={1.2} gap="gap-24">
        <B num={<AnimatedCounter target={4} duration={600} />} unit="企业走访" />
        <B num={<AnimatedCounter target={163} duration={1000} delay={400} />} unit="页调研报告" />
      </R>
    </div>
  )},

  // ── Research ──
  { id: "research-method", act: "research", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-10 max-w-4xl">
      <T size="7xl">调研教会我：<Em>怎么发现问题</Em></T>
      <div className="grid md:grid-cols-2 gap-10 w-full">
        <div className="space-y-3">
          {["「你们量最大的是什么？」", "「用工最多的环节是什么？」", "「你们最想解决什么问题？」", "「你们愿意投多少钱？」"].map((q, i) => (
            <motion.div key={i} {...fade(0.5 + i * 0.15)} className="flex items-center gap-3">
              <span className="text-xs font-mono text-amber-400/30 w-4">{i + 1}</span>
              <p className="text-sm text-white/50 font-light">{q}</p>
            </motion.div>
          ))}
          <motion.p {...fade(1.2)} className="text-xs text-white/20 italic pl-7 pt-2">企业说的问题，不一定是真问题。</motion.p>
        </div>
        <div className="flex flex-col items-center justify-center gap-4">
          <R delay={0.6} gap="gap-4">
            {[{ l: "发现真实问题", I: Search }, { l: "分析根因", I: Lightbulb }, { l: "技术方案", I: Code2 }, { l: "快速验证", I: Zap }].map((x, j, a) => (
              <React.Fragment key={j}>
                <C delay={0.7 + j * 0.12}>
                  <x.I className="w-8 h-8 text-emerald-400/40" />
                  <p className="text-xs font-medium text-white/55 mt-2">{x.l}</p>
                </C>
                {j < a.length - 1 && <p className="text-white/10 text-lg">→</p>}
              </React.Fragment>
            ))}
          </R>
          <N delay={1.4}>这套方法不只适用于产业调研——写论文也一样。</N>
        </div>
      </div>
    </div>
  )},

  { id: "director-question", act: "research", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-10">
      <N delay={0}>周院长看到短视频说 <Em>AI 能一键生成论文</Em></N>
      <motion.p {...fade(0.5)} className="text-5xl md:text-7xl font-black text-white text-center leading-tight max-w-3xl">
        实验室有些同学<br /><EmR>三年</EmR>写不出一篇论文
      </motion.p>
      <motion.p {...fade(1)} className="text-2xl md:text-3xl text-emerald-400/60 font-light text-center">「能不能用 AI 帮忙？」</motion.p>
      <X delay={1.6}>我没有马上动手——先用方法论分析问题。</X>
    </div>
  )},

  // ── Pain ──
  { id: "real-painpoints", act: "pain", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-10">
      <T size="7xl">用追问的方法<br />找到真正的痛点</T>
      <R delay={0.4} gap="gap-12 md:gap-16">
        {[
          { s: "「写不出来」", r: "不是写不出来，是引用造假", d: "AI 编造的引用格式完美\n但查无此文", I: Quote },
          { s: "「不会写」", r: "不是不会写，是不懂规范", d: "通用 AI 不了解\n农业科研写作规则", I: FileText },
          { s: "「能力差」", r: "不是能力差，是时间花在机械劳动", d: "排版·核对·格式化\n占 80% 时间", I: Clock },
        ].map((x, i) => (
          <C key={i} delay={0.6 + i * 0.2}>
            <x.I className="w-6 h-6 text-white/15" />
            <p className="text-[10px] text-white/15 line-through mt-1">{x.s}</p>
            <p className="text-lg font-bold text-white mt-2 whitespace-pre-line leading-snug">{x.r}</p>
            <p className="text-xs text-white/30 font-light mt-2 whitespace-pre-line">{x.d}</p>
          </C>
        ))}
      </R>
      <N delay={1.5}>根因不是「人不行」——是<Em>AI 用错了方式</Em></N>
    </div>
  )},

  { id: "pain-fake-cite", act: "pain", title: "", content: (
    <div className="flex flex-col lg:flex-row items-center justify-center gap-10 max-w-6xl w-full">
      <div className="flex-1 text-center space-y-5">
        <motion.p {...fade(0)} className="text-4xl md:text-5xl font-black text-white">10 条引用<br /><EmR>8 条是编的</EmR></motion.p>
        <N delay={0.3}>格式完美 · DOI 齐全 · 查无此文</N>
        <X delay={0.6}>点击右侧「显示下一条」→ 让观众猜哪条有问题</X>
      </div>
      <motion.div {...fade(0.4)} className="flex-1 w-full max-w-md"><FakeReferencesDemo mode="manual" /></motion.div>
    </div>
  )},

  { id: "pain-solutions", act: "pain", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-8 w-full max-w-5xl">
      <T size="7xl">三个问题，三层解法</T>
      <div className="grid md:grid-cols-2 gap-8 w-full items-center">
        <div className="space-y-6 text-center md:text-left">
          <div>
            <motion.p {...fade(0.3)} className="text-2xl font-black text-white">不懂<span className="text-amber-400">领域</span></motion.p>
            <N delay={0.4}>Overclaim · 证据强度 · 田间试验设计——审稿人一眼看穿</N>
          </div>
          <div>
            <motion.p {...fade(0.6)} className="text-2xl font-black text-white">机械<span className="text-blue-400">劳动</span></motion.p>
            <N delay={0.7}>排版核对占 <span className="text-white/70 font-bold">80%</span>，真正思考只剩 <Em>20%</Em></N>
          </div>
        </div>
        <motion.div {...fade(0.5)}><ProblemSolutionDemo /></motion.div>
      </div>
      <R delay={1} gap="gap-16">
        {[
          { t: "RAG 知识库", d: "只引用真实存在的论文", I: Library },
          { t: "领域 Prompt", d: "8 个文件编码农业写作规范", I: Microscope },
          { t: "多 Agent", d: "Writer → Verifier → Refiner", I: Wrench },
        ].map((x, i) => (
          <C key={i} delay={1.1 + i * 0.1}>
            <x.I className="w-5 h-5 text-emerald-400/40" />
            <p className="text-base font-bold text-white mt-1">{x.t}</p>
            <p className="text-[10px] text-white/30 font-light">{x.d}</p>
          </C>
        ))}
      </R>
      <motion.p {...fade(1.6)} className="text-base text-white/40 font-light italic text-center">
        AI 是加速器，不是自动驾驶。科学判断必须你自己把关。
      </motion.p>
    </div>
  )},

  // ── Solution ──
  { id: "architecture", act: "solution", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-8">
      <T size="7xl">六层<Em>架构</Em></T>
      <P delay={0.2}>从数据到导出，每一层解决一个具体问题</P>
      <motion.div {...fade(0.5)}><ArchitectureDiagram /></motion.div>
      <N delay={1}>不是堆功能。是分层解耦的工程设计。</N>
    </div>
  )},

  { id: "rag-directions", act: "solution", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-8">
      <T size="7xl"><Em>RAG</Em> 知识库 · 多方向覆盖</T>
      <R delay={0.3} gap="gap-16 md:gap-20">
        <LiveKnowledgeStats />
      </R>
      <R delay={0.7} gap="gap-5">
        {DIRECTIONS.map((name, i) => (
          <C key={name} delay={0.8 + i * 0.06}>
            <Wheat className="w-4 h-4 text-emerald-400/30" />
            <p className="text-sm font-bold text-white">{name}</p>
          </C>
        ))}
      </R>
      <N delay={1.4}>AI 只能引用库里真实存在的论文 · 实验室各方向持续扩充索引</N>
    </div>
  )},

  { id: "pipeline-models", act: "solution", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-8 w-full max-w-5xl">
      <T size="7xl">Writer → Verifier → Refiner</T>
      <motion.div {...fade(0.3)} className="w-full max-w-2xl scale-90 origin-center"><WhyTwoModels /></motion.div>
      <R delay={0.6} gap="gap-10 md:gap-14">
        {[
          { t: "Writer", w: "DeepSeek", d: "按 IMRAD 结构逐节生成初稿", I: PenTool },
          { t: "Verifier", w: "智谱 GLM-4", d: "对照文献原文，逐条比对引用", I: ShieldCheck },
          { t: "Refiner", w: "DeepSeek", d: "根据审查意见修正，只改错不删观点", I: Wrench },
        ].map((x, i) => (
          <C key={i} delay={0.8 + i * 0.15}>
            <x.I className="w-7 h-7 text-emerald-400/40" />
            <p className="text-xl font-bold text-white mt-2">{x.t}</p>
            <p className="text-[10px] text-emerald-400/30 font-mono tracking-wider">{x.w}</p>
            <p className="text-xs text-white/35 font-light mt-1 max-w-[180px]">{x.d}</p>
          </C>
        ))}
      </R>
      <N delay={1.5}>两个不同的 AI 独立审查——自己审自己容易漏错</N>
    </div>
  )},

  { id: "domain-quality", act: "solution", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-8 w-full max-w-5xl">
      <T size="7xl">规范编码 + 质量保障</T>
      <div className="grid md:grid-cols-2 gap-8 w-full items-start">
        <div className="space-y-2">
          <P delay={0.2}>8 个 Prompt 文件 · 农业写作铁律</P>
          {PROMPT_HIGHLIGHTS.map((x, i) => (
            <motion.div key={i} {...fade(0.4 + i * 0.1)} className="flex items-start gap-2">
              <span className="text-[10px] font-mono text-emerald-400/25 w-4 pt-0.5">{i + 1}</span>
              <p className="text-xs text-white/45 font-light leading-relaxed">{x}</p>
            </motion.div>
          ))}
        </div>
        <div className="flex flex-col items-center gap-4">
          <P delay={0.3}>6 维度审查 · 写完不是终点</P>
          <motion.div {...fade(0.5)}><QualityDimensions /></motion.div>
        </div>
      </div>
      <N delay={1.2}>AI 写 + AI 审 + AI 改 = 三道防线降低风险</N>
    </div>
  )},

  { id: "chart-system", act: "solution", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-6 w-full max-w-5xl">
      <T size="7xl"><LiveChartCount />，自动生成</T>
      <P delay={0.2}>不只是写文字——输入数据，一键插入论文</P>
      <div className="grid grid-cols-3 gap-2.5 w-full max-w-3xl">
        {[
          { src: "/presentation/figures/Fig1_TG_DTG.png", label: "TG/DTG 热重分析" },
          { src: "/presentation/figures/Fig2_XRD.png", label: "XRD 衍射图谱" },
          { src: "/presentation/figures/Fig3_FTIR.png", label: "FTIR 红外光谱" },
          { src: "/presentation/figures/Fig4_ProductDistribution.png", label: "产物分布图" },
          { src: "/presentation/figures/Fig5_GasComposition.png", label: "气体组成分析" },
          { src: "/presentation/figures/Fig6_BioOilComposition.png", label: "生物油组分" },
        ].map((fig, i) => (
          <motion.div key={i} {...fade(0.4 + i * 0.1)} className="rounded-xl overflow-hidden border border-white/[0.08] bg-black/20">
            <img src={fig.src} alt={fig.label} className="w-full h-28 object-contain p-2" />
            <p className="text-[9px] text-white/25 font-light text-center pb-1.5">{fig.label}</p>
          </motion.div>
        ))}
      </div>
      <X delay={1.2}>Python 脚本 + JSON 配置注册，前端自动识别新图表类型</X>
    </div>
  )},

  { id: "live-demo-bridge", act: "solution", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-10 max-w-3xl">
      <motion.div {...fade(0)} className="relative">
        <motion.div animate={{ opacity: [0.1, 0.25, 0.1] }} transition={{ duration: 2.5, repeat: Infinity }} className="absolute inset-0 bg-emerald-400 blur-[80px] rounded-full scale-150" />
        <PenTool className="w-16 h-16 text-emerald-400/60 relative mx-auto" />
      </motion.div>
      <T size="7xl">接下来：<Em>真系统</Em>演示</T>
      <P delay={0.3}>不是动画——现场跑 Writer → Verifier → Refiner</P>
      <motion.div {...fade(0.6)} className="flex flex-col items-center gap-4">
        <Link href="/workbench" target="_blank"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-sm font-medium hover:bg-emerald-500/25 transition-colors">
          打开工作台 <ExternalLink className="w-4 h-4" />
        </Link>
        <N delay={0.8}>预置 demo 项目 · 选 Results 章节 · 点「扩写」<br />看 SSE 流式输出与引用核查</N>
      </motion.div>
      <X delay={1.2}>演示结束后回到此页，按 → 继续 · 彩排清单见 docs/presentation-live-demo.md</X>
    </div>
  )},

  // ── Results ──
  { id: "real-case", act: "results", title: "", content: (
    <div className="flex flex-col lg:flex-row items-center justify-center gap-12 max-w-6xl">
      <motion.div {...fade(0)} className="flex-1">
        <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-emerald-500/10">
          <img src="/presentation/paper-title.png" alt="生成的论文" className="max-h-[55vh] w-auto object-contain mx-auto" />
        </div>
      </motion.div>
      <motion.div {...fade(0.4)} className="flex-1 space-y-5">
        <p className="text-4xl md:text-5xl font-black text-white leading-tight">系统生成的<span className="text-emerald-400">真实论文</span></p>
        <div className="space-y-2.5">
          {[
            { l: "12,917 字", d: "完整研究型论文" },
            { l: "IMRAD 结构", d: "Abstract → Introduction → Methods → Results → Conclusion" },
            { l: "16 条引用", d: "每条来自知识库中真实存在的论文" },
            { l: "5 温度 × 3 重复", d: "完整统计分析与实验设计" },
            { l: "一键导出", d: "PDF / DOCX，符合格式规范" },
          ].map((x, i) => (
            <div key={i} className="flex items-center gap-3 text-sm text-white/40 font-light">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/40 shrink-0" />
              {x.l}<span className="text-white/15">— {x.d}</span>
            </div>
          ))}
        </div>
        <N delay={0.8}>学长学姐初稿反馈：「结构完整」</N>
      </motion.div>
    </div>
  )},

  { id: "plagiarism-check", act: "results", title: "", content: (
    <div className="flex flex-col lg:flex-row items-center justify-center gap-12 max-w-6xl">
      <div className="flex-1 text-center space-y-5">
        <motion.p {...fade(0)} className="text-[9rem] md:text-[11rem] font-black leading-none text-white">
          <span className="text-emerald-400">11</span><span className="text-3xl align-super">%</span>
        </motion.p>
        <P delay={0.3}>PaperPass 第三方查重</P>
        <N delay={0.6}>不是我自己说的。是机器判的。<br />远低于期刊投稿要求。</N>
        <motion.p {...fade(1)} className="text-sm text-white/20 font-light italic">AI 写 ≠ 抄袭。重点是你怎么用。</motion.p>
      </div>
      <motion.div {...fade(0.4)} className="flex-1">
        <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
          <img src="/presentation/plagiarism-report.png" alt="PaperPass 查重报告" className="max-h-[50vh] w-auto object-contain mx-auto" />
        </div>
      </motion.div>
    </div>
  )},

  { id: "user-feedback", act: "results", title: "", content: (
    <div className="flex flex-col lg:flex-row items-center justify-center gap-12 max-w-5xl">
      <motion.div {...fade(0)} className="flex-1">
        <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
          <img src="/presentation/chat-feedback.png" alt="学长反馈" className="max-h-[50vh] w-auto object-contain mx-auto" />
        </div>
      </motion.div>
      <div className="flex-1 space-y-6">
        <motion.p {...fade(0.3)} className="text-3xl md:text-4xl font-black text-white leading-snug">「比我自己写的<Em>还要好</Em>」</motion.p>
        <motion.p {...fade(0.5)} className="text-xl md:text-2xl font-black text-white/70 leading-snug">「你这个东西做下去<Em>不得了啊</Em>」</motion.p>
        <N delay={0.9}>真实的学长反馈 · 系统已在帮实验室同学写初稿</N>
        <X delay={1.3}>当前：内测阶段</X>
      </div>
    </div>
  )},

  // ── Process ──
  { id: "the-crash", act: "process", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-10 max-w-3xl">
      <N delay={0}>你们刚看到的成果，是<span className="text-white/60">第四版</span>。<br />第三版某个晚上，我差点全部放弃。</N>
      <motion.p {...fade(0.5)} className="text-xs text-white/15 tracking-[0.3em] uppercase">第三周的某个晚上</motion.p>
      <motion.div {...fade(0.7)} className="space-y-4 text-center">
        <p className="text-3xl md:text-4xl font-black text-white leading-snug">我想加<span className="text-emerald-400">自动插图</span>——<br />改了一处，Results 全乱了。</p>
        <p className="text-lg text-white/35 font-light">改了<span className="text-rose-400/70">四个小时</span>，改不回去。</p>
      </motion.div>
      <motion.div {...fade(1.2)} className="space-y-2 text-center">
        <p className="text-4xl md:text-5xl font-black text-white">凌晨两点 · 全部推倒</p>
      </motion.div>
      <motion.p {...fade(1.6)} className="text-lg text-white/45 font-light text-center leading-relaxed">
        推倒不是因为写错了——是因为<span className="text-white/80 font-medium">终于知道了什么是对的</span>。
      </motion.p>
    </div>
  )},

  { id: "honest", act: "process", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-10 max-w-4xl">
      <T size="7xl">这个系统</T>
      <R delay={0.3} gap="gap-10">
        {[
          { no: "不是商业产品", yes: "是本科生 2 个月的原型", color: "text-amber-400" },
          { no: "不是一个 AI 聊天", yes: "是一套科研写作工作流", color: "text-sky-400" },
          { no: "不是完美的", yes: "但我明天就能改", color: "text-emerald-400" },
        ].map((x, i) => (
          <C key={i} delay={0.5 + i * 0.2}>
            <p className="text-xs text-white/15 line-through mb-1">{x.no}</p>
            <p className={`text-lg font-bold ${x.color}`}>{x.yes}</p>
          </C>
        ))}
      </R>
      <motion.div {...fade(1.4)} className="text-center space-y-2">
        <p className="text-2xl md:text-3xl font-black text-white">我就在<Em>实验室里</Em></p>
        <p className="text-lg text-white/30 font-light">需求到代码的距离，只有一张桌子</p>
      </motion.div>
    </div>
  )},

  // ── Close ──
  { id: "ai-era-method", act: "close", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-12 max-w-3xl">
      <T>在 AI 时代，我想分享<Em>一个思路</Em></T>
      <R delay={0.5} gap="gap-10">
        <motion.div {...fade(0.7)} className="text-center space-y-3">
          <p className="text-2xl text-white/50 font-light">与其仰望别人的<span className="text-white/70 font-medium">酷炫作品</span></p>
          <p className="text-3xl md:text-4xl font-black text-white">不如主动了解<br />AI 的<span className="text-emerald-400">能力边界</span></p>
        </motion.div>
      </R>
      <motion.div {...fade(1.5)} className="text-center space-y-4">
        <p className="text-2xl text-white/50 font-light">基于这个认知</p>
        <p className="text-3xl md:text-4xl font-black text-white">开发<span className="text-emerald-400">属于自己的</span>小工具</p>
      </motion.div>
      <motion.p {...fade(2.5)} className="text-xl text-white/40 font-light text-center max-w-xl leading-relaxed">
        不论多简单。<br />能提升学习或工作效率的，就是<span className="text-emerald-400 font-medium">好应用</span>。
      </motion.p>
    </div>
  )},

  { id: "what-wont-change", act: "close", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-12 max-w-3xl">
      <T>AI 越来越强，<br /><Em>什么不会变？</Em></T>
      <motion.div {...fade(0.6)} className="text-center space-y-6">
        <p className="text-xl text-white/35 font-light leading-relaxed max-w-xl">
          今天的 AI 能写论文、画图、写代码<br />
          明天的 AI 会更强大
        </p>
        <motion.p {...fade(1.2)} className="text-3xl md:text-4xl font-black text-white leading-snug">
          但有一件事不会变：<br /><span className="text-emerald-400">发现问题的能力</span><br />永远不会过时
        </motion.p>
      </motion.div>
      <motion.p {...fade(2)} className="text-xl text-white/40 font-light text-center max-w-xl leading-relaxed">
        这两个月我学到的最重要的东西<br />不是 React，不是 Next.js<br />而是<span className="text-white/70 font-medium">怎么从真实世界中发现痛点</span>
      </motion.p>
    </div>
  )},

  { id: "engineer-training", act: "close", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-12 max-w-3xl">
      <T size="7xl">这，正是<Em>卓工院</Em><br />想要培养的能力</T>
      <R delay={0.5} gap="gap-12">
        {[{ l: "调研能力", I: Search }, { l: "追问根因", I: Lightbulb }, { l: "持续学习", I: Code2 }, { l: "快速验证", I: Zap }].map((x, j, a) => (
          <React.Fragment key={j}>
            <C delay={0.7 + j * 0.15}>
              <x.I className="w-7 h-7 text-emerald-400/40" />
              <p className="text-sm font-medium text-white/60 mt-2">{x.l}</p>
            </C>
            {j < a.length - 1 && <p className="text-white/10 text-lg">·</p>}
          </React.Fragment>
        ))}
      </R>
      <motion.p {...fade(1.5)} className="text-lg text-white/45 font-light text-center max-w-xl leading-relaxed">
        这不是「我有多厉害」的故事——<br />是「<span className="text-emerald-400 font-medium">方法比工具重要</span>」的证明。
      </motion.p>
    </div>
  )},

  { id: "thanks", act: "close", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-10">
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, ease: E }} className="relative">
        <motion.div animate={{ opacity: [0.15, 0.35, 0.15] }} transition={{ duration: 3, repeat: Infinity }} className="absolute inset-0 bg-emerald-400 blur-[120px] rounded-full scale-150" />
        <Wheat className="w-16 h-16 md:w-20 md:h-20 text-emerald-400 relative" />
      </motion.div>
      <motion.div {...fade(0.4)} className="space-y-3 text-center max-w-xl">
        <p className="text-lg text-white/40 font-light">感谢<span className="text-white/60">周院长</span>的支持和信任</p>
        <div className="w-10 h-px bg-white/10 mx-auto" />
        <p className="text-sm text-white/25 font-light">感谢实验室四个方向的老师和同学</p>
        <p className="text-sm text-white/20 font-light">感谢台下每一位老师的聆听</p>
      </motion.div>
      <motion.p {...fade(0.9)} className="text-lg md:text-xl font-bold text-white/60 text-center max-w-2xl leading-relaxed">
        一个大二学生，用半年时间，从零到一，<br />独立交付了一个完整的工程系统。
      </motion.p>
      <motion.p {...fade(1.4)} className="text-4xl md:text-6xl font-black text-white">这只是开始<span className="text-emerald-400">。</span></motion.p>
      <div className="flex flex-col items-center gap-2 pt-4">
        <Link href="/knowledge" target="_blank" className="text-xs text-emerald-400/40 hover:text-emerald-400/60 transition-colors">
          体验知识库 →
        </Link>
        <p className="text-[10px] text-white/[0.06] tracking-[0.3em] uppercase">黄奕轩 · 2026.06 · GrainScript</p>
      </div>
    </div>
  )},
];

/** Plan B：Live Demo 失败时追加，访问 /presentation?backup=1 */
export const slidesBackup: (SlideContent & { act: Act })[] = [
  { id: "pipeline-demo", act: "solution", title: "", content: (
    <div className="flex flex-col items-center justify-center gap-8 w-full max-w-4xl">
      <T size="7xl">管道演示（备份）</T>
      <motion.div {...fade(0.4)} className="w-full"><WritingPipelineDemo /></motion.div>
      <N delay={0.8}>逐字生成 → 逐条核查 → 自动修正</N>
    </div>
  )},
  { id: "cite-compare", act: "solution", title: "", content: (
    <div className="flex flex-col lg:flex-row items-center justify-center gap-12 max-w-5xl">
      <motion.div {...fade(0)} className="flex-1 text-center space-y-4">
        <p className="text-xs text-rose-400/40 tracking-[0.3em] uppercase">ChatGPT</p>
        <p className="text-3xl font-black text-white/60">10 条 → <EmR>8 条编造</EmR></p>
      </motion.div>
      <motion.div {...fade(0.3)} className="flex-1 w-full"><CitationCheckDemo /></motion.div>
    </div>
  )},
];

export const tagMap: Record<string, string> = {
  cover: "开场",
  "hook-crisis": "钩子",
  "hook-evidence": "引子",
  "origin-journey": "起点",
  invitation: "转折",
  "research-trips": "调研",
  "research-method": "方法论",
  "director-question": "新命题",
  "real-painpoints": "痛点",
  "pain-fake-cite": "痛点",
  "pain-solutions": "解法",
  architecture: "系统架构",
  "rag-directions": "知识库",
  "pipeline-models": "写作管道",
  "domain-quality": "质量保障",
  "chart-system": "图表系统",
  "live-demo-bridge": "现场演示",
  "real-case": "真实案例",
  "plagiarism-check": "查重验证",
  "user-feedback": "用户反馈",
  "the-crash": "真实过程",
  honest: "诚实定位",
  "ai-era-method": "AI 时代",
  "what-wont-change": "核心洞察",
  "engineer-training": "教育本质",
  thanks: "致谢",
  "pipeline-demo": "备份·管道",
  "cite-compare": "备份·引用",
};
