"use client";

import { motion } from "framer-motion";

/** 追问链动画：从表面深挖到本质 */
export function QuestionChain() {
  const questions = [
    "「你们量最大的是什么？」",
    "「用工最多的环节是什么？」",
    "「你们最想解决什么问题？」",
    "「你们愿意投多少钱？」",
  ];

  return (
    <div className="space-y-3">
      {questions.map((q, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.3 }}
          className="flex items-center gap-3"
        >
          <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-mono text-xs font-bold">
            {i + 1}
          </div>
          <div className="flex-1 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
            <p className="text-amber-200/80 text-sm">{q}</p>
          </div>
        </motion.div>
      ))}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="text-slate-400 text-xs mt-4 pl-11 italic"
      >
        从表面深挖到本质——这是我学到的最重要的一课
      </motion.p>
    </div>
  );
}
