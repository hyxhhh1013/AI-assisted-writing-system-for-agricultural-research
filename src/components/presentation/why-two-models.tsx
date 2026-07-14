"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { PenTool, ShieldCheck, Brain } from "lucide-react";

const E = [0.22, 1, 0.36, 1] as const;

export function WhyTwoModels() {
  const [phase, setPhase] = useState(0);
  const [loop, setLoop] = useState(0);

  useEffect(() => {
    setPhase(0);
    const t: NodeJS.Timeout[] = [];
    t.push(setTimeout(() => setPhase(1), 600));
    t.push(setTimeout(() => setPhase(2), 1800));
    t.push(setTimeout(() => setPhase(3), 3000));
    t.push(setTimeout(() => setLoop((l) => l + 1), 10000));
    return () => t.forEach(clearTimeout);
  }, [loop]);

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl">
      {/* Two model cards */}
      <div className="flex gap-6 w-full">
        {/* Writer */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5, ease: E }}
          className="flex-1 p-5 bg-blue-500/[0.06] rounded-2xl border border-blue-500/20 text-center space-y-3"
        >
          <PenTool className="w-8 h-8 text-blue-400/50 mx-auto" />
          <div>
            <p className="text-xl font-bold text-white">Writer</p>
            <p className="text-[10px] text-blue-400/30 font-mono tracking-wider mt-0.5">DeepSeek</p>
          </div>
          <p className="text-xs text-white/35 font-light leading-relaxed">
            写作能力强<br />成本低，适合长篇生成<br />按 IMRAD 结构逐节起草
          </p>
        </motion.div>

        {/* Verifier */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5, delay: 0.2, ease: E }}
          className="flex-1 p-5 bg-emerald-500/[0.06] rounded-2xl border border-emerald-500/20 text-center space-y-3"
        >
          <ShieldCheck className="w-8 h-8 text-emerald-400/50 mx-auto" />
          <div>
            <p className="text-xl font-bold text-white">Verifier</p>
            <p className="text-[10px] text-emerald-400/30 font-mono tracking-wider mt-0.5">智谱 GLM-4</p>
          </div>
          <p className="text-xs text-white/35 font-light leading-relaxed">
            独立模型，不同架构<br />拿到原文逐条比对<br />杜绝"自己审自己"
          </p>
        </motion.div>
      </div>

      {/* Key insight */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5, ease: E }}
        className="flex items-center gap-3 px-5 py-3 bg-white/[0.04] rounded-xl border border-white/[0.06]"
      >
        <Brain className="w-4 h-4 text-amber-400/50" />
        <p className="text-sm text-white/50 font-light">
          自己写、自己审、自己改——<span className="text-amber-400/80 font-medium">永远发现不了问题</span>
        </p>
      </motion.div>

      {/* Academic basis */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5, ease: E }}
        className="text-center"
      >
        <p className="text-[11px] text-white/20 font-light">
          学术依据：Chain-of-Verification Reduces Hallucination
        </p>
        <p className="text-[10px] text-white/15 font-light">
          Dhuliawala et al., 2024 · arXiv:2309.11495
        </p>
      </motion.div>
    </div>
  );
}
