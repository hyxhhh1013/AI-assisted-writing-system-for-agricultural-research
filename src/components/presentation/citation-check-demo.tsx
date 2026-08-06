"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

/** 引用核查逐条验证动画 */
export function CitationCheckDemo() {
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
      t.push(setTimeout(() => setChecks((prev) => [...prev, { ...item, status: "checking" }]), i * 800 + 400));
      t.push(setTimeout(() => setChecks((prev) => prev.map((c, j) => j === i ? { ...c, status: item.status } : c)), i * 800 + 1200));
    });
    t.push(setTimeout(() => setDone(true), items.length * 800 + 1600));
    t.push(setTimeout(() => setLoop((l) => l + 1), 8000));
    return () => t.forEach(clearTimeout);
  }, [loop]);

  return (
    <div className="p-4 bg-white/5 backdrop-blur rounded-2xl border border-white/10 space-y-2 font-mono text-xs">
      <p className="text-[10px] font-bold text-slate-400 mb-1">引用真实性核查</p>
      {checks.map((c) => (
        <motion.div key={c.num} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-0">
          <span className="text-slate-500 w-5">[{c.num}]</span>
          <span className="flex-1 text-slate-300">{c.ref}</span>
          {c.status === "checking" && <span className="text-amber-400 animate-pulse">核查中</span>}
          {c.status === "pass" && <span className="text-emerald-400 font-bold">✓ 通过</span>}
          {c.status === "warn" && <span className="text-rose-400 font-bold">⚠ 归属存疑</span>}
        </motion.div>
      ))}
      {done && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="pt-2 text-[10px] text-slate-400">
          核查完成：3 条通过，1 条需要人工确认
        </motion.div>
      )}
    </div>
  );
}
