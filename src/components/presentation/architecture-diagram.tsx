"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { FileText, Database, Code2, Users, ShieldCheck, Download } from "lucide-react";
import { usePresentationStats } from "./live-stats";

const E = [0.22, 1, 0.36, 1] as const;

const STATIC_LAYERS = [
  { num: 6, title: "导出层", desc: "PDF / Word · 4 种模板 · 自动排版", Icon: Download, color: "bg-violet-500" },
  { num: 5, title: "质量保障", desc: "引用核查 · 一致性审查 · 查重 · Overclaim 检测", Icon: ShieldCheck, color: "bg-rose-500" },
  { num: 4, title: "多 Agent 协作", desc: "Writer (DeepSeek) → Verifier (GLM-4) → Refiner", Icon: Users, color: "bg-amber-500" },
  { num: 3, title: "Prompt 工程", desc: "IMRAD 结构 · 证据强度 · 8 个领域文件", Icon: Code2, color: "bg-sky-500" },
];

export function ArchitectureDiagram() {
  const stats = usePresentationStats();
  const [visible, setVisible] = useState(0);
  const [loop, setLoop] = useState(0);

  const layers = useMemo(() => [
    ...STATIC_LAYERS,
    { num: 2, title: "RAG 知识库", desc: `${stats.knowledgeCount.toLocaleString()} 篇文献 · BM25 + 向量 · RRF 融合检索`, Icon: Database, color: "bg-emerald-500" },
    { num: 1, title: "数据与图表", desc: `${stats.chartCount} 种图表 · XRD 峰拟合 · 三线表 · 分子结构`, Icon: FileText, color: "bg-cyan-500" },
  ], [stats.knowledgeCount, stats.chartCount]);

  useEffect(() => {
    setVisible(0);
    const t: NodeJS.Timeout[] = [];
    layers.forEach((_, i) => {
      t.push(setTimeout(() => setVisible(i + 1), 400 + i * 250));
    });
    t.push(setTimeout(() => setLoop((l) => l + 1), 8000));
    return () => t.forEach(clearTimeout);
  }, [loop, layers]);

  return (
    <div className="w-full max-w-xl space-y-1.5">
      {layers.map((layer, i) => (
        <motion.div
          key={layer.num}
          initial={{ opacity: 0, x: -40 }}
          animate={visible > i ? { opacity: 1, x: 0 } : { opacity: 0, x: -40 }}
          transition={{ duration: 0.5, ease: E }}
          className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] transition-colors"
        >
          <div className={`w-7 h-7 rounded-lg ${layer.color} flex items-center justify-center text-[10px] font-black text-white flex-shrink-0`}>
            {layer.num}
          </div>
          <layer.Icon className="w-4 h-4 text-white/15 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white/80">{layer.title}</p>
            <p className="text-[11px] text-white/25 font-light truncate">{layer.desc}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
