"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Quote, Layers, AlertTriangle, FileCheck, Database, CheckCircle2 } from "lucide-react";

const E = [0.22, 1, 0.36, 1] as const;

const dims = [
  { icon: Quote, title: "引用核查", desc: "逐条比对被引文献原文，标记归属错误与虚构引用", color: "text-emerald-400" },
  { icon: Layers, title: "一致性审查", desc: "检测 Abstract-Results-Discussion 跨章节数据矛盾", color: "text-sky-400" },
  { icon: AlertTriangle, title: "Overclaim 检测", desc: "扫描全文，标记「首次」「证明」「最优」等过度措辞", color: "text-amber-400" },
  { icon: FileCheck, title: "格式规范", desc: "校验 GB/T 7713 格式、三线表、引用标注、章节结构", color: "text-violet-400" },
  { icon: Database, title: "数据溯源", desc: "确保每个数字和结论标注数据来源，避免无据可查", color: "text-cyan-400" },
  { icon: CheckCircle2, title: "结构完整性", desc: "检查 IMRAD 五步推进是否完整，引言缺口是否在结论中闭合", color: "text-rose-400" },
];

export function QualityDimensions() {
  const [visible, setVisible] = useState(0);
  const [loop, setLoop] = useState(0);

  useEffect(() => {
    setVisible(0);
    const t: NodeJS.Timeout[] = [];
    dims.forEach((_, i) => {
      t.push(setTimeout(() => setVisible(i + 1), 400 + i * 200));
    });
    t.push(setTimeout(() => setLoop((l) => l + 1), 8000));
    return () => t.forEach(clearTimeout);
  }, [loop]);

  return (
    <div className="grid grid-cols-2 gap-3 max-w-2xl w-full">
      {dims.map((dim, i) => (
        <motion.div
          key={dim.title}
          initial={{ opacity: 0, y: 12 }}
          animate={visible > i ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          transition={{ duration: 0.4, ease: E }}
          className="p-4 bg-white/[0.03] rounded-xl border border-white/[0.06] space-y-2"
        >
          <div className="flex items-center gap-2">
            <dim.icon className={`w-4 h-4 ${dim.color}/60`} />
            <p className="text-sm font-bold text-white/70">{dim.title}</p>
          </div>
          <p className="text-[11px] text-white/30 font-light leading-relaxed">{dim.desc}</p>
        </motion.div>
      ))}
    </div>
  );
}
