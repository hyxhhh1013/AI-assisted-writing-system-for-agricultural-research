"use client";

import React, { Suspense, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { slides, slidesBackup, tagMap, Act } from "@/components/presentation/slides";
import { PresentationStatsProvider } from "@/components/presentation/live-stats";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

// 7 幕真彩色背景 — 看得见的深色调
const bgMap: Record<Act, { color: string; glow: string }> = {
  hook:     { color: "#120106", glow: "radial-gradient(ellipse 70% 50% at 25% 30%, rgba(244,63,94,0.45) 0%, transparent 65%)" },
  story:    { color: "#140b02", glow: "radial-gradient(ellipse 70% 50% at 75% 70%, rgba(245,158,11,0.40) 0%, transparent 65%)" },
  research: { color: "#020d16", glow: "radial-gradient(ellipse 70% 50% at 80% 20%, rgba(56,189,248,0.40) 0%, transparent 65%)" },
  pain:     { color: "#14020a", glow: "radial-gradient(ellipse 70% 50% at 20% 50%, rgba(225,29,72,0.45) 0%, transparent 65%)" },
  solution: { color: "#02130b", glow: "radial-gradient(ellipse 70% 50% at 25% 65%, rgba(16,185,129,0.45) 0%, transparent 65%)" },
  results:  { color: "#02141a", glow: "radial-gradient(ellipse 70% 50% at 50% 40%, rgba(6,182,212,0.45) 0%, transparent 65%)" },
  process:  { color: "#0b0418", glow: "radial-gradient(ellipse 70% 50% at 75% 35%, rgba(139,92,246,0.40) 0%, transparent 65%)" },
  close:    { color: "#100d04", glow: "radial-gradient(ellipse 70% 50% at 50% 25%, rgba(251,191,36,0.30) 0%, transparent 65%)" },
};

const slideVars = {
  initial: { opacity: 0, filter: "blur(12px)" },
  animate: { opacity: 1, filter: "blur(0px)", transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
  exit: { opacity: 0, filter: "blur(12px)", transition: { duration: 0.3 } },
};

function PresentationDeck() {
  const searchParams = useSearchParams();
  const deck = searchParams.get("backup") === "1" ? [...slides, ...slidesBackup] : slides;
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(false);
  const next = useCallback(() => setI((p) => (p + 1) % deck.length), [deck.length]);
  const prev = useCallback(() => setI((p) => (p - 1 + deck.length) % deck.length), [deck.length]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [next, prev]);
  useEffect(() => { if (!auto) return; const t = setInterval(next, 20000); return () => clearInterval(t); }, [auto, next]);
  useEffect(() => { setI((p) => Math.min(p, deck.length - 1)); }, [deck.length]);
  const s = deck[i];

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden text-white">
      {/* 色底 + 光斑 — 直接放外层，不用负 z-index */}
      <AnimatePresence mode="wait">
        <motion.div key={`bg-${s.act}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.7 }} className="fixed inset-0" style={{ background: bgMap[s.act].color }} />
      </AnimatePresence>
      <AnimatePresence mode="wait">
        <motion.div key={`glow-${s.act}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }} className="fixed inset-0 pointer-events-none" style={{ background: bgMap[s.act].glow }} />
      </AnimatePresence>

      {/* 网点纹理 */}
      <div className="fixed inset-0 pointer-events-none opacity-25"
        style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px)", backgroundSize: "80px 80px" }} />

      {/* Top bar */}
      <header className="fixed top-0 inset-x-0 z-50 px-8 py-5 flex items-center justify-between select-none">
        <Link href="/" className="text-[10px] font-medium tracking-[0.4em] text-white/15 hover:text-white/30 uppercase transition-colors">GrainScript</Link>
        <div className="flex items-center gap-6">
          {tagMap[s.id] && <span className="text-[10px] font-medium tracking-[0.35em] text-white/20 uppercase">{tagMap[s.id]}</span>}
          <button onClick={() => setAuto(!auto)} className={`text-[10px] font-medium tracking-[0.3em] uppercase transition-colors ${auto ? "text-emerald-400/60" : "text-white/10 hover:text-white/25"}`}>{auto ? "⏸" : "▶"}</button>
          <span className="text-[11px] font-mono text-white/15 tabular-nums tracking-wider">{String(i + 1).padStart(2, "0")} / {String(deck.length).padStart(2, "0")}</span>
        </div>
      </header>

      {/* Slide */}
      <main className="flex-1 flex items-center justify-center z-10">
        <AnimatePresence mode="wait">
          <motion.div key={s.id} variants={slideVars} initial="initial" animate="animate" exit="exit"
            className="w-full h-full flex items-center justify-center px-12 md:px-20 lg:px-28 py-24">
            {s.content}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom bar */}
      <footer className="fixed bottom-0 inset-x-0 z-50 px-8 py-5 flex items-center justify-between select-none">
        <button onClick={prev} className="w-10 h-10 flex items-center justify-center text-white/10 hover:text-white/30 transition-colors"><ChevronLeft className="w-5 h-5" /></button>
        <div className="flex items-center gap-2.5">
          {deck.map((_, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && deck[idx].act !== deck[idx - 1].act && <div className="w-1" />}
              <button onClick={() => setI(idx)}
                className={`rounded-full transition-all duration-500 ${idx === i ? "w-5 h-1.5 bg-white/70" : "w-1.5 h-1.5 bg-white/[0.06] hover:bg-white/15"}`} />
            </React.Fragment>
          ))}
        </div>
        <button onClick={next} className="w-10 h-10 flex items-center justify-center text-white/15 hover:text-white/40 transition-colors"><ChevronRight className="w-5 h-5" /></button>
      </footer>
    </div>
  );
}

export default function PresentationPage() {
  return (
    <PresentationStatsProvider>
      <Suspense fallback={<div className="h-screen w-screen bg-[#120106] text-white/20 flex items-center justify-center text-sm">加载演示…</div>}>
        <PresentationDeck />
      </Suspense>
    </PresentationStatsProvider>
  );
}
