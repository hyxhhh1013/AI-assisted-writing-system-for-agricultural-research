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

// ── 功能演示动画组件 ──

/** 数字跳动动画 */
function AnimatedCounter({ target, duration = 1000, delay = 0, suffix = "" }: { target: number; duration?: number; delay?: number; suffix?: string }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - start - delay;
      if (elapsed < 0) return;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration, delay]);
  return <>{value}{suffix}</>;
}

/** 写作管道动画：Writer 流式生成 → Verifier 逐条审查 → Refiner 修正 */
function WritingPipelineDemo() {
  const [phase, setPhase] = useState<"idle" | "writing" | "verifying" | "refining" | "done">("idle");
  const [writerText, setWriterText] = useState("");
  const [verifyResults, setVerifyResults] = useState<{ num: number; status: "checking" | "pass" | "fail" }[]>([]);
  const [refineText, setRefineText] = useState("");
  const [loop, setLoop] = useState(0);

  const fullDraft = "生物质炭的施用显著提高了水稻产量。与对照处理相比，T2 处理的产量增加了 23.5%[1]。这一结果与邱良祝等[2]的研究一致，表明生物质炭能改善土壤理化性质。然而，高浓度处理（T4）的增产效果不显著（P>0.05），可能与土壤 pH 过高有关[3]。";
  const corrections = [
    { num: 1, status: "pass" as const },
    { num: 2, status: "pass" as const },
    { num: 3, status: "fail" as const },
  ];

  useEffect(() => {
    setPhase("idle");
    setWriterText("");
    setVerifyResults([]);
    setRefineText("");
    const t: NodeJS.Timeout[] = [];

    t.push(setTimeout(() => setPhase("writing"), 500));

    for (let i = 0; i <= fullDraft.length; i++) {
      t.push(setTimeout(() => {
        setWriterText(fullDraft.slice(0, i));
        if (i === fullDraft.length) {
          t.push(setTimeout(() => setPhase("verifying"), 600));
        }
      }, 800 + i * 25));
    }

    t.push(setTimeout(() => setVerifyResults([{ num: 1, status: "checking" }]), 2800));
    t.push(setTimeout(() => setVerifyResults([{ num: 1, status: "pass" }, { num: 2, status: "checking" }]), 3600));
    t.push(setTimeout(() => setVerifyResults([{ num: 1, status: "pass" }, { num: 2, status: "pass" }, { num: 3, status: "checking" }]), 4400));
    t.push(setTimeout(() => {
      setVerifyResults(corrections);
      t.push(setTimeout(() => setPhase("refining"), 600));
    }, 5200));

    const correctedText = fullDraft.replace("可能与土壤 pH 过高有关[3]", "可能与土壤 pH 过高有关（P>0.05）[3]，需进一步验证");
    for (let i = 0; i <= correctedText.length; i++) {
      t.push(setTimeout(() => {
        setRefineText(correctedText.slice(0, i));
        if (i === correctedText.length) {
          t.push(setTimeout(() => setPhase("done"), 400));
        }
      }, 6200 + i * 20));
    }

    t.push(setTimeout(() => setLoop(l => l + 1), 12000));
    return () => t.forEach(clearTimeout);
  }, [loop]);

  return (
    <div className="p-5 bg-white rounded-2xl border border-slate-200 space-y-4 font-mono text-xs">
      {/* 阶段指示器 */}
      <div className="flex items-center gap-2">
        {[
          { key: "writing", label: "Writer", icon: "✍️", color: "bg-blue-500" },
          { key: "verifying", label: "Verifier", icon: "🔍", color: "bg-emerald-500" },
          { key: "refining", label: "Refiner", icon: "🔧", color: "bg-purple-500" },
        ].map((s, i) => (
          <React.Fragment key={s.key}>
            {i > 0 && <div className={`w-6 h-0.5 ${phase === "idle" ? "bg-slate-200" : "bg-emerald-300"} transition-colors`} />}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all duration-500 ${
              phase === s.key ? "bg-emerald-500 text-white scale-110 shadow-lg shadow-emerald-200" :
              phase === "done" || (["verifying", "refining"].includes(phase) && ["writing"].includes(s.key)) ?
              "bg-slate-200 text-slate-500" : "bg-slate-100 text-slate-400"
            }`}>
              {s.label}
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Writer 输出 */}
      {phase === "writing" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 bg-blue-50 rounded-xl border border-blue-100">
          <p className="text-blue-600 text-[10px] font-bold mb-1">Writer (DeepSeek) 正在生成...</p>
          <p className="text-slate-700 leading-relaxed">{writerText}<span className="animate-pulse text-blue-500">|</span></p>
        </motion.div>
      )}

      {/* Verifier 审查 */}
      {phase === "verifying" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
          <p className="text-emerald-600 text-[10px] font-bold mb-2">Verifier (智谱 GLM-4) 正在核查引用...</p>
          <div className="space-y-1.5">
            {verifyResults.map((r) => (
              <motion.div key={r.num} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2">
                <span className="text-slate-500">[{r.num}]</span>
                {r.status === "checking" && <span className="text-amber-500 animate-pulse">核查中...</span>}
                {r.status === "pass" && <span className="text-emerald-600">✓ 通过</span>}
                {r.status === "fail" && <span className="text-rose-600">✗ 归属错误</span>}
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Refiner 修正 */}
      {(phase === "refining" || phase === "done") && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 bg-purple-50 rounded-xl border border-purple-100">
          <p className="text-purple-600 text-[10px] font-bold mb-1">
            Refiner {phase === "refining" ? "正在修正..." : "修正完成 ✓"}
          </p>
          <p className="text-slate-700 leading-relaxed">
            {phase === "refining" ? refineText : fullDraft.replace("可能与土壤 pH 过高有关[3]", "可能与土壤 pH 过高有关（P>0.05）[3]，需进一步验证")}
            {phase === "refining" && <span className="animate-pulse text-purple-500">|</span>}
          </p>
          {phase === "done" && (
            <p className="text-emerald-600 text-[10px] font-bold mt-2">已修正 1 处引用问题，保留原文风格</p>
          )}
        </motion.div>
      )}
    </div>
  );
}

/** RAG 检索动画：查询 → BM25 + 向量双路检索 → RRF 融合 → 命中 */
function RAGRetrievalDemo() {
  const [phase, setPhase] = useState<"idle" | "query" | "bm25" | "vector" | "fusion" | "done">("idle");
  const [bm25Results, setBm25Results] = useState<number[]>([]);
  const [vectorResults, setVectorResults] = useState<number[]>([]);
  const [fusionResults, setFusionResults] = useState<number[]>([]);
  const [loop, setLoop] = useState(0);

  const bm25Hits = [3, 1, 7, 12, 5];
  const vectorHits = [1, 5, 3, 9, 2];
  const fusionOrder = [1, 3, 5, 7, 2];

  useEffect(() => {
    setPhase("idle");
    setBm25Results([]);
    setVectorResults([]);
    setFusionResults([]);
    const t: NodeJS.Timeout[] = [];

    t.push(setTimeout(() => setPhase("query"), 400));
    t.push(setTimeout(() => setPhase("bm25"), 1200));

    bm25Hits.forEach((h, i) => {
      t.push(setTimeout(() => setBm25Results(prev => [...prev, h]), 1500 + i * 300));
    });

    t.push(setTimeout(() => setPhase("vector"), 3200));
    vectorHits.forEach((h, i) => {
      t.push(setTimeout(() => setVectorResults(prev => [...prev, h]), 3500 + i * 300));
    });

    t.push(setTimeout(() => setPhase("fusion"), 5200));
    fusionOrder.forEach((h, i) => {
      t.push(setTimeout(() => setFusionResults(prev => [...prev, h]), 5500 + i * 250));
    });

    t.push(setTimeout(() => setPhase("done"), 7000));
    t.push(setTimeout(() => setLoop(l => l + 1), 10000));

    return () => t.forEach(clearTimeout);
  }, [loop]);

  return (
    <div className="p-5 bg-white rounded-2xl border border-slate-200 space-y-3 font-mono text-xs">
      {/* 查询 */}
      {phase !== "idle" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-2 bg-slate-100 rounded-lg text-center">
          <span className="text-slate-500">查询：</span>
          <span className="text-slate-900 font-bold">「生物质炭对水稻产量的影响」</span>
        </motion.div>
      )}

      {/* 双路检索 */}
      <div className="grid grid-cols-2 gap-3">
        {/* BM25 */}
        <div className={`p-3 rounded-xl border transition-all duration-500 ${
          phase === "bm25" ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100"
        }`}>
          <p className="text-[10px] font-bold text-amber-600 mb-1.5">BM25 关键词</p>
          <div className="flex flex-wrap gap-1">
            {bm25Results.map((r, i) => (
              <motion.span key={i} initial={{ scale: 0 }} animate={{ scale: 1 }}
                className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px]">
                [{r}]
              </motion.span>
            ))}
            {phase === "bm25" && bm25Results.length < 5 && <span className="animate-pulse text-amber-400">...</span>}
          </div>
        </div>

        {/* 向量 */}
        <div className={`p-3 rounded-xl border transition-all duration-500 ${
          phase === "vector" ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-100"
        }`}>
          <p className="text-[10px] font-bold text-blue-600 mb-1.5">向量语义</p>
          <div className="flex flex-wrap gap-1">
            {vectorResults.map((r, i) => (
              <motion.span key={i} initial={{ scale: 0 }} animate={{ scale: 1 }}
                className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]">
                [{r}]
              </motion.span>
            ))}
            {phase === "vector" && vectorResults.length < 5 && <span className="animate-pulse text-blue-400">...</span>}
          </div>
        </div>
      </div>

      {/* RRF 融合 */}
      {(phase === "fusion" || phase === "done") && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
          <p className="text-[10px] font-bold text-emerald-600 mb-1.5">RRF 融合排序 → Top 5</p>
          <div className="flex gap-1.5">
            {fusionResults.map((r, i) => (
              <motion.span key={i} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300 }}
                className="px-3 py-1 bg-emerald-500 text-white rounded-lg text-[10px] font-bold">
                [{r}]
              </motion.span>
            ))}
          </div>
          {phase === "done" && (
            <p className="text-emerald-600 text-[10px] mt-2">从 12,000+ 知识块中找到最相关的 5 段文献</p>
          )}
        </motion.div>
      )}
    </div>
  );
}

/** 引用核查逐条验证动画 */
function CitationCheckDemo() {
  const [checks, setChecks] = useState<{ num: number; ref: string; status: "checking" | "pass" | "warn" }[]>([]);
  const [done, setDone] = useState(false);
  const [loop, setLoop] = useState(0);

  const items = [
    { num: 1, ref: "邱良祝等, 土壤, 2015", status: "pass" as const },
    { num: 2, ref: "张斌等, 环境科学, 2021", status: "pass" as const },
    { num: 3, ref: "Li et al., Biochar, 2023", status: "warn" as const },
    { num: 4, ref: "王明等, 农业工程学报, 2020", status: "pass" as const },
  ];

  useEffect(() => {
    setChecks([]);
    setDone(false);
    const t: NodeJS.Timeout[] = [];
    items.forEach((item, i) => {
      t.push(setTimeout(() => setChecks(prev => [...prev, { ...item, status: "checking" }]), i * 800 + 400));
      t.push(setTimeout(() => setChecks(prev => prev.map((c, j) => j === i ? { ...c, status: item.status } : c)), i * 800 + 1200));
    });
    t.push(setTimeout(() => setDone(true), items.length * 800 + 1600));
    t.push(setTimeout(() => setLoop(l => l + 1), 8000));
    return () => t.forEach(clearTimeout);
  }, [loop]);

  return (
    <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-2 font-mono text-xs">
      <p className="text-[10px] font-bold text-slate-500 mb-1">引用真实性核查</p>
      {checks.map((c) => (
        <motion.div key={c.num} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3 py-1.5 border-b border-slate-50 last:border-0">
          <span className="text-slate-400 w-5">[{c.num}]</span>
          <span className="flex-1 text-slate-600">{c.ref}</span>
          {c.status === "checking" && <span className="text-amber-500 animate-pulse">核查中</span>}
          {c.status === "pass" && <span className="text-emerald-600 font-bold">✓ 通过</span>}
          {c.status === "warn" && <span className="text-rose-600 font-bold">⚠ 归属存疑</span>}
        </motion.div>
      ))}
      {done && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="pt-2 text-[10px] text-slate-500">
          核查完成：3 条通过，1 条需要人工确认
        </motion.div>
      )}
    </div>
  );
}

/** ChatGPT 编造引用动画：10 条引用逐条被标记为虚构 */
function FakeReferencesDemo() {
  const [revealed, setRevealed] = useState(0);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [loop, setLoop] = useState(0);

  const refs = [
    { author: "Wang et al.", journal: "Nature Communications", year: "2023", doi: "10.1038/s41467-023-12345", fake: true },
    { author: "Chen & Li", journal: "Soil Biology & Biochemistry", year: "2022", doi: "10.1016/j.soilbio.2022.108", fake: false },
    { author: "Zhang et al.", journal: "Environmental Science & Technology", year: "2024", doi: "10.1021/acs.est.3c09876", fake: true },
    { author: "Liu et al.", journal: "Bioresource Technology", year: "2023", doi: "10.1016/j.biortech.2023.129", fake: true },
    { author: "Smith et al.", journal: "Global Change Biology", year: "2022", doi: "10.1111/gcb.16543", fake: true },
    { author: "Zhao & Wang", journal: "Plant and Soil", year: "2023", doi: "10.1007/s11104-023-05678", fake: true },
    { author: "Kim et al.", journal: "Scientific Reports", year: "2024", doi: "10.1038/s41598-024-56789", fake: true },
    { author: "Huang et al.", journal: "Agriculture, Ecosystems & Environment", year: "2023", doi: "10.1016/j.agee.2023.108", fake: false },
    { author: "Brown & Davis", journal: "Field Crops Research", year: "2022", doi: "10.1016/j.fcr.2022.108567", fake: true },
    { author: "Li et al.", journal: "Journal of Cleaner Production", year: "2024", doi: "10.1016/j.jclepro.2024.141", fake: true },
  ];

  useEffect(() => {
    setRevealed(0);
    setMarked(new Set());
    const t: NodeJS.Timeout[] = [];
    for (let i = 0; i <= refs.length; i++) {
      t.push(setTimeout(() => setRevealed(i), i * 300 + 500));
    }
    refs.forEach((r, i) => {
      if (r.fake) {
        t.push(setTimeout(() => setMarked(prev => new Set([...prev, i])), refs.length * 300 + 800 + i * 400));
      }
    });
    t.push(setTimeout(() => setLoop(l => l + 1), 12000));
    return () => t.forEach(clearTimeout);
  }, [loop]);

  const fakeCount = refs.filter(r => r.fake).length;

  return (
    <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold text-slate-500">ChatGPT 生成的参考文献</p>
        {marked.size > 0 && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
            className="px-2 py-0.5 bg-rose-100 text-rose-600 rounded-full text-[10px] font-bold">
            {fakeCount}/{refs.length} 条是编的
          </motion.span>
        )}
      </div>
      <div className="space-y-1">
        {refs.slice(0, revealed).map((r, i) => {
          const isMarked = marked.has(i);
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all duration-500 ${
                isMarked ? "bg-rose-50 border border-rose-200" :
                !r.fake && marked.size > 0 ? "bg-emerald-50 border border-emerald-200" :
                "bg-slate-50 border border-slate-100"
              }`}>
              <span className="text-slate-400 w-4">{i + 1}.</span>
              <span className={`flex-1 ${isMarked ? "text-rose-500 line-through" : !r.fake && marked.size > 0 ? "text-emerald-700" : "text-slate-600"}`}>
                {r.author} ({r.year}). {r.journal}. {r.doi}
              </span>
              {isMarked && <span className="text-rose-500 font-bold">✗ 编造</span>}
              {!r.fake && marked.size > 0 && <span className="text-emerald-600 font-bold">✓ 真实</span>}
            </motion.div>
          );
        })}
      </div>
      {marked.size >= fakeCount && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="text-rose-600 text-[10px] font-bold pt-1 text-center">
          ChatGPT 看起来很专业，但 {fakeCount} 条引用根本不存在
        </motion.p>
      )}
    </div>
  );
}

/** 七步流程时间线动画 */
function WorkflowTimelineDemo() {
  const [activeStep, setActiveStep] = useState(-1);
  const [loop, setLoop] = useState(0);
  const steps = [
    { label: "输入标题", icon: "📝", detail: "控释氮肥对水稻产量的影响", time: "10s" },
    { label: "生成大纲", icon: "📋", detail: "判断论文类型 → IMRAD 结构", time: "30s" },
    { label: "检索文献", icon: "🔍", detail: "BM25 + 向量 → RRF 融合", time: "3-5s" },
    { label: "逐节扩写", icon: "✍️", detail: "Writer Agent 流式生成", time: "30-60s" },
    { label: "审核修正", icon: "🔍", detail: "Verifier → Refiner", time: "20-40s" },
    { label: "质量检查", icon: "✅", detail: "6 维度一致性 + 引用核查", time: "30s" },
    { label: "导出 PDF", icon: "📄", detail: "SCI / GB / Nature / IEEE", time: "10s" },
  ];

  useEffect(() => {
    setActiveStep(-1);
    const t: NodeJS.Timeout[] = [];
    steps.forEach((_, i) => {
      t.push(setTimeout(() => setActiveStep(i), i * 1200 + 500));
    });
    t.push(setTimeout(() => setActiveStep(-1), steps.length * 1200 + 2000));
    t.push(setTimeout(() => setLoop(l => l + 1), steps.length * 1200 + 3000));
    return () => t.forEach(clearTimeout);
  }, [loop]);

  return (
    <div className="p-4 bg-white rounded-2xl border border-slate-200">
      <div className="flex items-center gap-1">
        {steps.map((s, i) => (
          <React.Fragment key={i}>
            <motion.div
              animate={{
                scale: activeStep === i ? 1.05 : 1,
                backgroundColor: activeStep === i ? "#10b981" : activeStep > i ? "#d1fae5" : "#f8fafc",
              }}
              transition={{ duration: 0.3 }}
              className="flex-1 rounded-xl p-2 text-center border border-slate-100"
            >
              <p className="text-lg mb-0.5">{s.icon}</p>
              <p className={`text-[9px] font-bold ${activeStep === i ? "text-white" : activeStep > i ? "text-emerald-700" : "text-slate-400"}`}>
                {s.label}
              </p>
              {activeStep === i && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-[8px] text-emerald-100 mt-0.5">{s.detail}</motion.p>
              )}
            </motion.div>
            {i < steps.length - 1 && (
              <motion.div
                animate={{ backgroundColor: activeStep > i ? "#10b981" : "#e2e8f0" }}
                className="w-3 h-0.5 rounded-full flex-shrink-0"
              />
            )}
          </React.Fragment>
        ))}
      </div>
      {activeStep >= 0 && activeStep < steps.length && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[10px] text-slate-500">步骤 {activeStep + 1}/7</span>
          <span className="text-[10px] text-emerald-600 font-bold">预计耗时：{steps[activeStep].time}</span>
        </motion.div>
      )}
    </div>
  );
}

/** 数据→图表生成动画 */
function DataToChartDemo() {
  const [phase, setPhase] = useState<"idle" | "data" | "analyzing" | "chart" | "done">("idle");
  const [barHeights, setBarHeights] = useState<number[]>([]);
  const [loop, setLoop] = useState(0);

  const csvData = [
    { label: "CK", values: [45.2, 48.1] },
    { label: "T1", values: [52.3, 54.8] },
    { label: "T2", values: [58.7, 61.2] },
    { label: "T3", values: [56.1, 58.9] },
    { label: "T4", values: [50.4, 52.6] },
  ];
  const maxVal = 70;
  const chartH = 120;

  // 所有柱子的目标高度（像素）
  const targetHeights = csvData.flatMap(row => row.values.map(v => (v / maxVal) * chartH));

  useEffect(() => {
    setPhase("idle");
    setBarHeights([]);
    const t: NodeJS.Timeout[] = [];
    t.push(setTimeout(() => setPhase("data"), 400));
    t.push(setTimeout(() => setPhase("analyzing"), 1800));
    t.push(setTimeout(() => {
      setPhase("chart");
      // 逐根柱子生长
      targetHeights.forEach((h, idx) => {
        t.push(setTimeout(() => {
          setBarHeights(prev => {
            const next = [...prev];
            next[idx] = h;
            return next;
          });
        }, idx * 120));
      });
    }, 3000));
    t.push(setTimeout(() => setPhase("done"), 3000 + targetHeights.length * 120 + 600));
    t.push(setTimeout(() => setLoop(l => l + 1), 9000));
    return () => t.forEach(clearTimeout);
  }, [loop]);

  return (
    <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3">
      {/* CSV 数据 */}
      {(phase === "data" || phase === "analyzing") && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-1">
          <p className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            上传的实验数据 (CSV)
          </p>
          <div className="font-mono text-[9px] bg-slate-50 rounded-lg p-2 border border-slate-100">
            <div className="grid grid-cols-4 gap-1 text-slate-400 font-bold mb-1">
              <span>处理</span><span>产量_1</span><span>产量_2</span><span>均值</span>
            </div>
            {csvData.map((row, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.15 }}
                className="grid grid-cols-4 gap-1 text-slate-600">
                <span className="font-bold">{row.label}</span>
                <span>{row.values[0]}</span>
                <span>{row.values[1]}</span>
                <span className="text-emerald-600 font-bold">{((row.values[0] + row.values[1]) / 2).toFixed(1)}</span>
              </motion.div>
            ))}
          </div>
          {phase === "analyzing" && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-blue-600 text-[10px] animate-pulse">分析数据结构... 推荐图表：分组柱状图</motion.p>
          )}
        </motion.div>
      )}

      {/* 柱状图 */}
      {(phase === "chart" || phase === "done") && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          <p className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            生成的图表
          </p>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            {/* Y 轴 */}
            <div className="relative" style={{ height: chartH, paddingLeft: 28 }}>
              <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[7px] text-slate-400" style={{ width: 24 }}>
                <span>70</span><span>50</span><span>30</span><span>0</span>
              </div>
              {/* 网格线 */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" style={{ left: 28 }}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="w-full border-t border-slate-200/60" />
                ))}
              </div>
              {/* 柱子 */}
              <div className="flex items-end justify-around h-full gap-2">
                {csvData.map((row, i) => (
                  <div key={i} className="flex flex-col items-center gap-1 flex-1">
                    <div className="w-full flex justify-center gap-1 items-end" style={{ height: chartH }}>
                      {row.values.map((v, j) => {
                        const idx = i * 2 + j;
                        return (
                          <div key={j}
                            className="w-5 rounded-t-sm transition-all duration-500 ease-out"
                            style={{
                              height: barHeights[idx] ?? 0,
                              backgroundColor: j === 0 ? "#34d399" : "#059669",
                            }}
                          />
                        );
                      })}
                    </div>
                    <span className="text-[8px] text-slate-500 font-bold">{row.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-center mt-2">
              <span className="text-[8px] text-slate-400">不同处理对水稻产量的影响 (kg/plot)</span>
            </div>
            <div className="flex justify-center gap-4 mt-1">
              <div className="flex items-center gap-1 text-[7px] text-slate-500">
                <div className="w-2 h-2 rounded-sm bg-emerald-400" />2024 年
              </div>
              <div className="flex items-center gap-1 text-[7px] text-slate-500">
                <div className="w-2 h-2 rounded-sm bg-emerald-600" />2025 年
              </div>
            </div>
          </div>
          {phase === "done" && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-emerald-600 text-[10px] font-bold text-center">
              一键插入到 Results 章节 → 图表编号自动更新
            </motion.p>
          )}
        </motion.div>
      )}
    </div>
  );
}

/** 问题→解法覆盖动画 */
function ProblemSolutionDemo() {
  const [showSolution, setShowSolution] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [loop, setLoop] = useState(0);

  const items = [
    { problem: "引用虚构", desc: "AI 编造不存在的论文", solution: "RAG 知识库", solDesc: "只引用真实文献" },
    { problem: "不懂领域", desc: "通用 AI 不了解农业规范", solution: "领域 Prompt", solDesc: "8 个深度定制文件" },
    { problem: "机械劳动", desc: "排版、核对、格式化", solution: "多 Agent", solDesc: "写→审→改自动管道" },
  ];

  useEffect(() => {
    setShowSolution(false);
    setActiveIdx(-1);
    const t: NodeJS.Timeout[] = [];
    items.forEach((_, i) => {
      t.push(setTimeout(() => setActiveIdx(i), i * 600 + 500));
    });
    t.push(setTimeout(() => setShowSolution(true), items.length * 600 + 1000));
    t.push(setTimeout(() => setLoop(l => l + 1), 8000));
    return () => t.forEach(clearTimeout);
  }, [loop]);

  return (
    <div className="flex gap-4">
      {items.map((item, i) => (
        <div key={i} className="flex-1 relative">
          {/* 问题卡片 */}
          <motion.div
            animate={{
              opacity: activeIdx >= i ? 1 : 0.3,
              scale: activeIdx >= i ? 1 : 0.95,
            }}
            className="p-4 rounded-2xl border bg-rose-50 border-rose-200 text-center"
          >
            <p className="font-black text-rose-700 text-sm">{item.problem}</p>
            <p className="text-rose-500 text-[10px] mt-1">{item.desc}</p>
          </motion.div>
          {/* 解法覆盖 */}
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={showSolution ? { y: 0, opacity: 1 } : { y: 30, opacity: 0 }}
            transition={{ delay: i * 0.2, type: "spring", stiffness: 200 }}
            className="absolute inset-0 p-4 rounded-2xl border bg-emerald-50 border-emerald-200 text-center flex flex-col justify-center"
          >
            <p className="font-black text-emerald-700 text-sm">{item.solution}</p>
            <p className="text-emerald-600 text-[10px] mt-1">{item.solDesc}</p>
          </motion.div>
        </div>
      ))}
    </div>
  );
}

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
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.15, 0.4] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 bg-emerald-400 blur-[60px] rounded-full"
          />
          <div className="absolute inset-0 bg-emerald-100 blur-[50px] rounded-full" />
          <div className="relative p-12 bg-white rounded-[2.5rem] border border-emerald-100 shadow-2xl shadow-emerald-200/50">
            <Wheat className="w-24 h-24 text-emerald-600" />
          </div>
        </motion.div>
        <div className="space-y-3">
          <motion.h1 variants={itemVariants} className="text-7xl md:text-8xl font-black tracking-tighter bg-gradient-to-r from-emerald-700 via-emerald-500 to-teal-500 bg-clip-text text-transparent">
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

  // Slide 2：AI 能写，但不能信 — 真实故事
  {
    id: "pain-points",
    title: "AI 能写，但不能信",
    subtitle: "一个让我做这个项目的真实经历",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
        <motion.div variants={itemVariants} className="space-y-5">
          <div className="p-6 bg-rose-50 rounded-2xl border border-rose-200">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              <span className="font-bold text-rose-700">ChatGPT 给我的参考文献</span>
            </div>
            <p className="text-slate-700 text-sm leading-relaxed">
              我让它帮我写文献综述，它列了 10 条参考文献，格式完美、DOI 齐全。
            </p>
            <p className="text-rose-600 font-black text-xl mt-3">
              我去查了——8 条是编的。
            </p>
          </div>
          <div className="space-y-3">
            {[
              { icon: AlertTriangle, label: "引用虚构", desc: "AI 编造不存在的论文，格式完美但查无此文", color: "text-rose-500" },
              { icon: Globe, label: "不懂领域", desc: "通用 AI 不了解农业科研的写作规范和术语", color: "text-amber-500" },
              { icon: Clock, label: "机械劳动", desc: "排版、引用格式化、跨章节核对……60% 时间花在这", color: "text-blue-500" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-100">
                <item.icon className={`w-5 h-5 ${item.color} flex-shrink-0`} />
                <div>
                  <span className="font-bold text-slate-900 text-sm">{item.label}</span>
                  <p className="text-slate-500 text-xs">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
        <motion.div variants={itemVariants} className="flex flex-col items-center gap-6">
          <FakeReferencesDemo />
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 max-w-md">
            <p className="text-emerald-800 text-xs font-medium text-center">
              我的目标：让 AI 的每一条引用<span className="font-black">都有据可查</span>，每一个数据都能<span className="font-black">追溯到原文</span>
            </p>
          </div>
        </motion.div>
      </div>
    ),
  },

  // Slide 2b：不懂领域 — 通用 AI vs 农业领域 AI
  {
    id: "domain-gap",
    title: "通用 AI 不懂农业科研",
    subtitle: "同一个问题，两种回答",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div variants={itemVariants} className="space-y-4">
          <div className="p-5 bg-rose-50 rounded-2xl border border-rose-200">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-rose-500" />
              <span className="font-bold text-rose-700 text-sm">ChatGPT 写的 Results</span>
            </div>
            <div className="p-3 bg-white rounded-xl border border-rose-100 text-xs text-slate-700 leading-relaxed space-y-2">
              <p><span className="text-rose-500 font-bold">✗</span> "The results <span className="bg-rose-100 px-1 rounded">demonstrated</span> that biochar <span className="bg-rose-100 px-1 rounded">significantly enhanced</span> rice yield."</p>
              <p className="text-rose-500 text-[10px]">问题：Results 用 "demonstrated"（证明）属于 Overclaim，应该用 "indicated"（表明）</p>
              <p><span className="text-rose-500 font-bold">✗</span> "The experiment was conducted <span className="bg-rose-100 px-1 rounded">in the field</span>."</p>
              <p className="text-rose-500 text-[10px]">问题：田间试验缺少关键信息——地点、品种、处理设计、重复次数</p>
              <p><span className="text-rose-500 font-bold">✗</span> "T2 treatment showed the <span className="bg-rose-100 px-1 rounded">best</span> performance."</p>
              <p className="text-rose-500 text-[10px]">问题："best" 是过度宣称，应该说 "the highest yield among treatments"</p>
            </div>
          </div>
          <div className="p-4 bg-slate-900 rounded-xl text-white text-xs">
            <p className="text-slate-400 mb-1">通用 AI 的问题：</p>
            <p className="text-slate-200">不懂 Results/Discussion 句式铁律、不懂田间试验设计规范、不懂证据强度分级。写出来的东西<span className="text-rose-400 font-bold">看起来专业，审稿人一眼看穿</span>。</p>
          </div>
        </motion.div>
        <motion.div variants={itemVariants} className="space-y-4">
          <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-200">
            <div className="flex items-center gap-2 mb-3">
              <Microscope className="w-4 h-4 text-emerald-500" />
              <span className="font-bold text-emerald-700 text-sm">禾书耕文写的 Results</span>
            </div>
            <div className="p-3 bg-white rounded-xl border border-emerald-100 text-xs text-slate-700 leading-relaxed space-y-2">
              <p><span className="text-emerald-500 font-bold">✓</span> "Biochar application <span className="bg-emerald-100 px-1 rounded">increased</span> rice yield by 23.5% in T2 treatment <span className="bg-emerald-100 px-1 rounded">compared with</span> the control (P{'<'}0.05, n=3)."</p>
              <p className="text-emerald-600 text-[10px]">客观报告，含统计检验和重复数</p>
              <p><span className="text-emerald-500 font-bold">✓</span> "The field experiment was conducted at the Experimental Farm of XX University (30°N, 120°E) during the 2024 rice growing season, using variety 'XX-1'. A randomized complete block design with three replications was employed."</p>
              <p className="text-emerald-600 text-[10px]">完整的田间试验描述：地点、品种、设计、重复</p>
              <p><span className="text-emerald-500 font-bold">✓</span> "T2 treatment <span className="bg-emerald-100 px-1 rounded">exhibited the highest</span> yield among all treatments."</p>
              <p className="text-emerald-600 text-[10px]">避免 "best"，用客观比较表述</p>
            </div>
          </div>
          <div className="p-4 bg-emerald-900 rounded-xl text-white text-xs">
            <p className="text-emerald-300 mb-1">领域 Prompt 的优势：</p>
            <p className="text-emerald-100">8 个 prompt 文件编码了<span className="text-emerald-400 font-bold">农业科研写作规范</span>——证据强度分级、Results/Discussion 铁律、田间试验设计要求、Overclaim 检测。</p>
          </div>
        </motion.div>
      </div>
    ),
  },

  // Slide 2c：机械劳动 — 时间都花在哪了
  {
    id: "mechanical-work",
    title: "写一篇论文，时间都花在哪了？",
    subtitle: "80% 的时间消耗在不需要创造力的工作上",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <motion.div variants={itemVariants} className="space-y-4">
          {[
            { icon: Search, label: "查阅文献", desc: "从几百篇论文中翻找支撑论点的依据", time: "2-4 周", pct: 30 },
            { icon: PenTool, label: "撰写初稿", desc: "把实验数据转化为规范的学术语言", time: "4-8 周", pct: 35 },
            { icon: ListChecks, label: "核对校验", desc: "引用编号、数据一致性、格式规范", time: "1-2 周", pct: 15 },
          ].map((item, i) => (
            <motion.div key={i} variants={itemVariants}
              className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-100">
              <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
                <item.icon className="w-5 h-5 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-900 text-sm">{item.label}</span>
                  <span className="text-emerald-600 font-black text-sm">{item.time}</span>
                </div>
                <p className="text-slate-500 text-xs">{item.desc}</p>
                <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${item.pct}%` }}
                    transition={{ duration: 1, delay: i * 0.3 }}
                    className="h-full bg-amber-400 rounded-full" />
                </div>
              </div>
            </motion.div>
          ))}
          <div className="flex items-center gap-4 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-emerald-900 text-sm">思考创新</span>
                <span className="text-emerald-600 font-black text-sm">20%</span>
              </div>
              <p className="text-emerald-600 text-xs">实验设计、数据解读、科学判断——这才是核心</p>
              <div className="mt-2 h-1.5 bg-emerald-100 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: "20%" }}
                  transition={{ duration: 1, delay: 0.9 }}
                  className="h-full bg-emerald-500 rounded-full" />
              </div>
            </div>
          </div>
        </motion.div>
        <motion.div variants={itemVariants} className="flex flex-col items-center gap-6">
          <div className="relative w-56 h-56">
            <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
              <circle cx="100" cy="100" r="80" fill="none" stroke="#f1f5f9" strokeWidth="28" />
              <motion.circle cx="100" cy="100" r="80" fill="none" stroke="#f59e0b" strokeWidth="28"
                initial={{ strokeDasharray: "0 503" }}
                animate={{ strokeDasharray: `${0.30 * 503} 503` }}
                transition={{ duration: 1, delay: 0.3 }} strokeLinecap="round" />
              <motion.circle cx="100" cy="100" r="80" fill="none" stroke="#ef4444" strokeWidth="28"
                initial={{ strokeDasharray: "0 503" }}
                animate={{ strokeDasharray: `${0.35 * 503} 503`, strokeDashoffset: -0.30 * 503 }}
                transition={{ duration: 1, delay: 0.6 }} strokeLinecap="round" />
              <motion.circle cx="100" cy="100" r="80" fill="none" stroke="#3b82f6" strokeWidth="28"
                initial={{ strokeDasharray: "0 503" }}
                animate={{ strokeDasharray: `${0.15 * 503} 503`, strokeDashoffset: -0.65 * 503 }}
                transition={{ duration: 1, delay: 0.9 }} strokeLinecap="round" />
              <motion.circle cx="100" cy="100" r="80" fill="none" stroke="#10b981" strokeWidth="28"
                initial={{ strokeDasharray: "0 503" }}
                animate={{ strokeDasharray: `${0.20 * 503} 503`, strokeDashoffset: -0.80 * 503 }}
                transition={{ duration: 1, delay: 1.2 }} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.p initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.5, type: "spring" }}
                className="text-4xl font-black text-slate-900">
                <AnimatedCounter target={80} duration={1200} delay={1500} suffix="%" />
              </motion.p>
              <p className="text-xs text-slate-500">机械劳动</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {[
              { color: "bg-amber-500", label: "查文献 30%" },
              { color: "bg-red-500", label: "写初稿 35%" },
              { color: "bg-blue-500", label: "核对 15%" },
              { color: "bg-emerald-500", label: "思考创新 20%" },
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

  // Slide 3：三个问题，三层解法
  {
    id: "before-after",
    title: "三个问题，三层解法",
    subtitle: "不是替代思考，是让 AI 处理机械劳动",
    content: (
      <div className="space-y-6">
        <motion.div variants={itemVariants}>
          <ProblemSolutionDemo />
        </motion.div>
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { solution: "RAG 知识库", desc: "AI 只能引用实验室真实存在的论文，每条引用可追溯到原文", icon: Library },
            { solution: "领域 Prompt", desc: "8 个 prompt 文件为农业科研深度定制：田间试验、品种比较、GB/T 7713", icon: Microscope },
            { solution: "多 Agent 自动化", desc: "Writer→Verifier→Refiner 三步管道，自动审查、修正、排版", icon: Wrench },
          ].map((item, i) => (
            <motion.div key={i} variants={itemVariants}
              className="p-4 bg-white rounded-xl border border-slate-100 flex items-start gap-3">
              <item.icon className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-slate-900 text-sm">{item.solution}</p>
                <p className="text-slate-500 text-xs mt-0.5">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
        <motion.div variants={itemVariants} className="p-4 bg-slate-900 rounded-2xl text-center">
          <p className="text-slate-300 text-sm">
            AI 是<span className="text-white font-bold">加速器</span>，不是自动驾驶。
            它处理机械劳动，<span className="text-emerald-400 font-bold">科学判断必须你自己把关</span>。
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
        <motion.div variants={itemVariants}>
          <WorkflowTimelineDemo />
        </motion.div>
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

  // Slide 6：知识库 — 解决"引用虚构"
  {
    id: "knowledge-1",
    title: "你的专属「论文图书馆」",
    subtitle: "解决第一个问题：AI 不再凭空编造引用",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
        <motion.div variants={itemVariants} className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100 text-center shadow-sm shadow-amber-100/50">
              <p className="text-4xl font-black text-amber-600">910</p>
              <p className="text-sm text-amber-700 mt-1">篇已索引论文</p>
            </div>
            <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 text-center shadow-sm shadow-blue-100/50">
              <p className="text-4xl font-black text-blue-600">7</p>
              <p className="text-sm text-blue-700 mt-1">个学科分类</p>
            </div>
            <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100 text-center shadow-sm shadow-emerald-100/50">
              <p className="text-4xl font-black text-emerald-600">12K+</p>
              <p className="text-sm text-emerald-700 mt-1">知识块</p>
            </div>
          </div>
          <div className="p-5 bg-rose-50 rounded-2xl border border-rose-100">
            <p className="text-rose-700 text-sm leading-relaxed">
              <span className="font-bold">为什么能解决引用虚构？</span><br />
              AI 写作时只能引用知识库中<span className="font-black">真实存在</span>的论文。每条引用都标注了来源编号，你随时可以追溯到原文验证。
            </p>
          </div>
          <div className="p-5 bg-white rounded-2xl border border-slate-100">
            <p className="text-slate-700 text-sm leading-relaxed mb-3">
              <span className="font-bold">混合检索：</span>BM25 关键词精确匹配 + 向量语义理解，RRF 融合排序。
            </p>
            <RAGRetrievalDemo />
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
              { cat: "其他农业", n: "若干" },
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

  // Slide 7：写作引擎 — 解决"不懂领域" + 多 Agent 审查
  {
    id: "writing-1",
    title: "AI 怎么写论文？",
    subtitle: "解决第二、三个问题：领域定制 + 独立审查",
    content: (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-3 items-stretch">
          {[
            { step: "第一步", title: "写作", who: "DeepSeek", desc: "按 IMRAD 结构逐节生成，引言遵循「背景→问题→缺口→目标」逻辑链，讨论按「发现→机制→对比→局限→展望」推进。", icon: PenTool, color: "bg-blue-50 border-blue-200", iconBg: "bg-blue-500" },
            { step: "第二步", title: "审核", who: "智谱 GLM-4", desc: "独立 AI 拿到被引用文献的原文，逐条比对：引用是否真实、数据是否一致、有没有过度宣称。", icon: ScanEye, color: "bg-emerald-50 border-emerald-200", iconBg: "bg-emerald-500" },
            { step: "第三步", title: "修改", who: "DeepSeek", desc: "根据审查意见逐条修正。被禁止「为通过审查而删除引用」——只改错误，不删观点。", icon: Wrench, color: "bg-purple-50 border-purple-200", iconBg: "bg-purple-500" },
          ].flatMap((s, i, arr) => {
            const card = (
              <motion.div key={`card-${i}`} variants={itemVariants}
                className={`${s.color} border rounded-2xl p-6 flex flex-col items-center text-center gap-4 shadow-sm`}>
                <div className={`w-14 h-14 rounded-2xl ${s.iconBg} text-white flex items-center justify-center shadow-lg`}>
                  <s.icon className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-[10px] font-mono text-slate-400 mb-1">{s.step}</p>
                  <h4 className="font-bold text-slate-900 text-lg">{s.title}</h4>
                  <Badge className="mt-1 mb-2 border-0 text-[10px]">{s.who}</Badge>
                  <p className="text-slate-500 text-sm leading-relaxed">{s.desc}</p>
                </div>
              </motion.div>
            );
            if (i < arr.length - 1) {
              const arrow = (
                <motion.div key={`arrow-${i}`} variants={itemVariants}
                  className="hidden md:flex items-center justify-center">
                  <div className="flex flex-col items-center gap-1">
                    <motion.div
                      animate={{ x: [0, 4, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                      className="w-8 h-0.5 bg-gradient-to-r from-slate-300 to-slate-400 rounded-full"
                    />
                    <ChevronRight className="w-4 h-4 text-slate-300 -ml-4" />
                  </div>
                </motion.div>
              );
              return [card, arrow];
            }
            return [card];
          })}
        </div>
        <motion.div variants={itemVariants}>
          <WritingPipelineDemo />
        </motion.div>
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-900 text-sm">为什么用两个不同的 AI？</p>
              <p className="text-slate-500 text-xs mt-1">
                自己审自己容易漏错。独立模型审查 = 请了一个「挑刺的」。学术依据：Chain-of-Verification (2024)、Multiagent Debate (2023)。
              </p>
            </div>
          </div>
          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-start gap-3">
            <Microscope className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-900 text-sm">领域深度定制</p>
              <p className="text-slate-500 text-xs mt-1">
                8 个 prompt 文件：证据强度分级（禁止"首次/证明"）、Results/Discussion 句式铁律、田间试验设计规范、Overclaim 检测。
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    ),
  },

  // Slide 8：质量保障（质量检查 + 查重合并）
  {
    id: "quality",
    title: "写完还要「体检」+「查重」",
    subtitle: "六项检查 + 四种改写策略，双管齐下",
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
          <div className="space-y-4">
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
                <h4 className="font-bold text-slate-900">四种改写策略</h4>
              </div>
              <div className="space-y-2">
                {["同义替换：换个说法表达同一个意思", "语序调整：重新组织句子结构", "概括精简：提取核心信息，去掉冗余", "扩写重组：展开或精简内容"].map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-slate-600">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />{s}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <CitationCheckDemo />
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
          <DataToChartDemo />
          <div className="grid grid-cols-2 gap-2">
            {[
              { cat: "数据图表", items: ["柱状图", "折线图", "散点图", "饼图", "百分比堆积柱状图"], n: 6 },
              { cat: "示意图", items: ["流程图", "分子结构"], n: 2 },
              { cat: "XRD 分析", items: ["峰拟合", "晶胞可视化", "非晶分析", "Bragg", "图谱模拟", "XPS"], n: 6 },
              { cat: "表格", items: ["三线表 (GB/T 7714)"], n: 1 },
            ].map((g, i) => (
              <div key={i} className="p-3 bg-white rounded-xl border border-slate-100">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-bold text-slate-900 text-[10px]">{g.cat}</h4>
                  <Badge className="bg-slate-100 text-slate-600 border-0 text-[9px]">{g.n} 种</Badge>
                </div>
                <div className="space-y-0.5">
                  {g.items.map((it, j) => (
                    <div key={j} className="flex items-center gap-1.5 text-[9px] text-slate-500">
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
              <span className="font-bold">亮点：</span>三线表符合 GB/T 7714 国标规范，含统计检验字母上标和 ANOVA 结果。加新图只需 1 个 Python + 1 条 JSON，前端自动识别。
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

  // Slide 11：诚实的定位
  {
    id: "gap",
    title: "诚实地说——做到了什么，没做到什么",
    subtitle: "这是一个证明了「方向可行」的原型，不是成品",
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
              {["910 篇论文知识库（7 分类 / 12K+ 知识块）", "Writer→Verifier→Refiner 三步管道", "8 个领域 Prompt 文件深度定制", "6 维度质量审查 + 查重改写", "15 种图表 + 4 种导出模板"].map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4 flex-shrink-0" />{s}</div>
              ))}
            </div>
          </div>
          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200">
            <p className="font-bold text-slate-700 mb-2">诚实的局限性</p>
            <div className="space-y-1.5">
              {["UI 不如商业平台精美（1 人开发，1 个月）", "期刊级定制模板还没做", "图表插入位置需手动调整", "没有大规模用户测试", "部署在个人 VPS，稳定性有限"].map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-slate-600"><Clock className="w-4 h-4 flex-shrink-0" />{s}</div>
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
    subtitle: "三个阶段，每一步有明确的交付物",
    content: (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              phase: "第一阶段",
              time: "6 月 – 7 月中旬（7 周）",
              goal: "能用：部署上线 + 真课题验证",
              items: [
                "VPS 部署，实验室同学可访问",
                "3-5 个真实课题全流程验证",
                "批量扩写（多子节排队生成）",
                "扩写进度可恢复（刷新不丢失）",
                "撤销/重做（扩写后可回退）",
                "根据真实反馈修复问题",
              ],
              color: "emerald" as const,
            },
            {
              phase: "第二阶段",
              time: "7 月下旬 – 9 月（10 周）",
              goal: "好用：质量提升 + 数据能力",
              items: [
                "投前自检报告（Overclaim/引用完整性）",
                "多文件 CSV 对比分析",
                "引文事实核查升级（NLI 语义比对）",
                "图表-正文数据联动校验",
                "Prisma 正式 migration",
              ],
              color: "blue" as const,
            },
            {
              phase: "第三阶段",
              time: "10 月 – 12 月（10 周）",
              goal: "打磨：模板扩展 + 整体优化",
              items: [
                "新增 1-2 种农业期刊模板",
                "全流程回归测试（5 个课题）",
                "bug 修复 + 性能优化",
                "实验室内部试用 + 培训",
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
        <motion.div variants={itemVariants} className="p-4 bg-amber-50 rounded-xl border border-amber-100 text-center">
          <p className="text-amber-700 text-xs">
            <span className="font-bold">说明：</span>以上是基于当前进度的保守估计。第一阶段的核心目标是「部署上线 + 真课题验证」，后续阶段根据实际反馈调整优先级。
          </p>
        </motion.div>
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
    title: "我需要什么？",
    subtitle: "",
    content: (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div variants={itemVariants} className="space-y-4">
          {[
            { need: "各课题组的论文 PDF", why: "目前知识库只覆盖 7 个子方向。如果能把实验室各课题组的论文都加进来，覆盖面会好很多。", priority: "最需要" },
            { need: "拿真实课题跑一遍", why: "系统还没在真实论文上跑过完整流程。需要有人拿自己的课题试一下，告诉我哪里卡、哪里不对。", priority: "最需要" },
            { need: "告诉我哪里写得不对", why: "prompt 规则是我查学术写作规范后自己写的，没有经过实际检验。领域老师看一眼就能指出问题。", priority: "很需要" },
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
            <h4 className="text-lg font-bold">为什么值得支持</h4>
            <p className="text-slate-300 text-sm leading-relaxed">
              解螺旋是 50 人公司做了数年的产品。我是一个人做了一个月的原型。比功能数量没有意义。
            </p>
            <p className="text-slate-300 text-sm leading-relaxed">
              但我的优势是：<span className="text-emerald-400 font-bold">我就在实验室里</span>。商业平台不会为了你们实验室改一个 prompt、加一种图表类型。我可以，因为需求到代码的距离只有一张桌子。
            </p>
            <p className="text-slate-300 text-sm leading-relaxed">
              这套架构是通用的。在 3-5 个课题上验证可行后，换一个研究方向、换一个实验室，也能用。<span className="text-white font-bold">投入的时间不会浪费。</span>
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
        <p className="text-slate-400 font-mono text-[10px] tracking-[0.4em] uppercase pt-16">GrainScript · v2.2.0 · Agricultural AI Research</p>
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
    "pain-points": "核心问题", "domain-gap": "领域鸿沟", "mechanical-work": "时间分布",
    "before-after": "问题与解法",
    "modules": "系统总览", "workflow": "完整流程",
    "knowledge-1": "知识库", "writing-1": "写作引擎",
    "quality": "质量保障", "charts": "图表工具",
    "lab-value": "实验室价值", "gap": "诚实定位",
    "roadmap": "路线图", "support": "需要的支持",
  };

  return (
    <div className="min-h-screen w-full flex flex-col overflow-hidden bg-[#f8fafc] text-slate-900 selection:bg-emerald-100 selection:text-emerald-900">
      <AgriBackground />

      {/* Header */}
      <motion.header
        initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="fixed top-0 left-0 w-full px-6 py-4 z-50 flex items-center justify-between pointer-events-none"
      >
        <div className="pointer-events-auto flex items-center gap-3">
          <img src="/aifa-logo.png" alt="AIFA" className="w-14 h-14 rounded-full object-cover" />
          <div className="flex flex-col">
            <span className="text-xs font-mono text-slate-500 font-bold tracking-widest">GRAINSCRIPT</span>
            <span className="text-[10px] text-slate-400 tracking-wide">AIFA Lab</span>
          </div>
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
