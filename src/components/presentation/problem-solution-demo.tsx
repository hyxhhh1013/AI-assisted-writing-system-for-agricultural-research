"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

/** 问题→解法覆盖动画 */
export function ProblemSolutionDemo() {
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
    t.push(setTimeout(() => setLoop((l) => l + 1), 8000));
    return () => t.forEach(clearTimeout);
  }, [loop]);

  return (
    <div className="flex gap-4">
      {items.map((item, i) => (
        <div key={i} className="flex-1 relative">
          <motion.div
            animate={{ opacity: activeIdx >= i ? 1 : 0.3, scale: activeIdx >= i ? 1 : 0.95 }}
            className="p-4 rounded-2xl border bg-rose-500/10 border-rose-500/30 text-center"
          >
            <p className="font-black text-rose-400 text-sm">{item.problem}</p>
            <p className="text-rose-300/70 text-[10px] mt-1">{item.desc}</p>
          </motion.div>
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={showSolution ? { y: 0, opacity: 1 } : { y: 30, opacity: 0 }}
            transition={{ delay: i * 0.2, type: "spring", stiffness: 200 }}
            className="absolute inset-0 p-4 rounded-2xl border bg-emerald-500/10 border-emerald-500/30 text-center flex flex-col justify-center"
          >
            <p className="font-black text-emerald-400 text-sm">{item.solution}</p>
            <p className="text-emerald-300/70 text-[10px] mt-1">{item.solDesc}</p>
          </motion.div>
        </div>
      ))}
    </div>
  );
}
