"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";

const REFS = [
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

/** ChatGPT 编造引用：auto 循环播放；manual 由演讲者点击推进（互动找茬） */
export function FakeReferencesDemo({ mode = "auto" }: { mode?: "auto" | "manual" }) {
  const [revealed, setRevealed] = useState(mode === "manual" ? 0 : 0);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [loop, setLoop] = useState(0);
  const [verifying, setVerifying] = useState(false);

  const fakeCount = REFS.filter((r) => r.fake).length;
  const allRevealed = revealed >= REFS.length;
  const verifyDone = marked.size >= fakeCount;

  useEffect(() => {
    if (mode !== "auto") return;
    setRevealed(0);
    setMarked(new Set());
    setVerifying(false);
    const t: NodeJS.Timeout[] = [];
    for (let i = 0; i <= REFS.length; i++) {
      t.push(setTimeout(() => setRevealed(i), i * 300 + 500));
    }
    REFS.forEach((r, i) => {
      if (r.fake) {
        t.push(setTimeout(() => setMarked((prev) => new Set([...prev, i])), REFS.length * 300 + 800 + i * 400));
      }
    });
    t.push(setTimeout(() => setLoop((l) => l + 1), 12000));
    return () => t.forEach(clearTimeout);
  }, [loop, mode]);

  const revealNext = useCallback(() => {
    setRevealed((n) => Math.min(n + 1, REFS.length));
  }, []);

  const runVerify = useCallback(() => {
    if (verifying || verifyDone) return;
    setVerifying(true);
    let delay = 0;
    const t: NodeJS.Timeout[] = [];
    REFS.forEach((r, i) => {
      if (r.fake) {
        t.push(setTimeout(() => setMarked((prev) => new Set([...prev, i])), delay));
        delay += 350;
      }
    });
    return () => t.forEach(clearTimeout);
  }, [verifying, verifyDone]);

  return (
    <div className="p-4 bg-white/5 backdrop-blur rounded-2xl border border-white/10 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold text-slate-400">ChatGPT 生成的参考文献</p>
        {marked.size > 0 && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
            className="px-2 py-0.5 bg-rose-500/20 text-rose-400 rounded-full text-[10px] font-bold">
            {fakeCount}/{REFS.length} 条是编的
          </motion.span>
        )}
      </div>
      <div className="space-y-1 max-h-[280px] overflow-y-auto">
        {REFS.slice(0, revealed).map((r, i) => {
          const isMarked = marked.has(i);
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all duration-500 ${
                isMarked ? "bg-rose-500/10 border border-rose-500/30" :
                !r.fake && marked.size > 0 ? "bg-emerald-500/10 border border-emerald-500/30" :
                "bg-white/5 border border-white/5"
              }`}>
              <span className="text-slate-500 w-4">{i + 1}.</span>
              <span className={`flex-1 truncate ${isMarked ? "text-rose-400 line-through" : !r.fake && marked.size > 0 ? "text-emerald-400" : "text-slate-300"}`}>
                {r.author} ({r.year}). {r.journal}. {r.doi}
              </span>
              {isMarked && <span className="text-rose-400 font-bold text-[9px]">✗ 编造</span>}
              {!r.fake && marked.size > 0 && <span className="text-emerald-400 font-bold text-[9px]">✓ 真实</span>}
            </motion.div>
          );
        })}
      </div>
      {verifyDone && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="text-rose-400 text-[10px] font-bold pt-1 text-center">
          ChatGPT 看起来很专业，但 {fakeCount} 条引用根本不存在
        </motion.p>
      )}
      {mode === "manual" && (
        <div className="flex gap-2 pt-2 justify-center">
          {!allRevealed && (
            <button type="button" onClick={revealNext}
              className="px-3 py-1.5 rounded-lg text-[10px] font-medium bg-white/10 text-white/70 hover:bg-white/15 transition-colors">
              显示下一条
            </button>
          )}
          {allRevealed && !verifyDone && (
            <button type="button" onClick={runVerify}
              className="px-3 py-1.5 rounded-lg text-[10px] font-medium bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors">
              开始验真
            </button>
          )}
        </div>
      )}
    </div>
  );
}
