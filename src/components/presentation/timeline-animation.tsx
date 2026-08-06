"use client";

import { motion } from "framer-motion";

interface TimelineItem {
  date: string;
  title: string;
  desc: string;
}

/** 时间轴动画 */
export function TimelineAnimation({ items }: { items: TimelineItem[] }) {
  return (
    <div className="relative">
      <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-gradient-to-b from-emerald-500/60 via-emerald-500/30 to-transparent" />
      <div className="space-y-6">
        {items.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.2 }}
            className="flex items-start gap-4 relative"
          >
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 border-2 border-emerald-500/50 flex items-center justify-center flex-shrink-0 z-10">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
            <div>
              <span className="text-emerald-400 font-mono text-xs font-bold">{item.date}</span>
              <h4 className="text-white font-bold text-sm mt-0.5">{item.title}</h4>
              <p className="text-slate-400 text-xs mt-0.5">{item.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
