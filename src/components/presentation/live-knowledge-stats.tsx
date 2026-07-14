"use client";

import { motion } from "framer-motion";
import { usePresentationStats } from "./live-stats";
import { AnimatedCounter } from "./animated-counter";

const E = [0.22, 1, 0.36, 1] as const;

function B({ num, unit, delay = 0 }: { num: React.ReactNode; unit: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, delay, ease: E }}
      className="flex flex-col items-center gap-1 px-6 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08]"
    >
      <span className="text-4xl font-black text-emerald-400 tabular-nums">{num}</span>
      <span className="text-[11px] text-white/30 font-light">{unit}</span>
    </motion.div>
  );
}

export function LiveKnowledgeStats() {
  const stats = usePresentationStats();

  return (
    <>
      <B num={<AnimatedCounter target={stats.knowledgeCount} duration={1200} />} unit="篇文献" />
      <B num={`${stats.categoryCount} 个`} unit="学科分类" delay={0.15} />
      <B num={<AnimatedCounter target={stats.chunkCount} duration={1500} />} unit="个知识块" delay={0.3} />
    </>
  );
}

/** Live chart count replacement for "14 种图表" */
export function LiveChartCount() {
  const stats = usePresentationStats();
  return <>{stats.chartCount} 种图表</>;
}
