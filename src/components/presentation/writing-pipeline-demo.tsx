"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

/** 写作管道动画：Writer → Verifier → Refiner */
export function WritingPipelineDemo() {
  const [phase, setPhase] = useState<"idle" | "writing" | "verifying" | "refining" | "done">("idle");
  const [writerText, setWriterText] = useState("");
  const [verifyResults, setVerifyResults] = useState<{ num: number; status: "checking" | "pass" | "fail" }[]>([]);
  const [refineText, setRefineText] = useState("");
  const [loop, setLoop] = useState(0);

  const fullDraft =
    "生物质炭的施用显著提高了水稻产量。与对照处理相比，T2 处理的产量增加了 23.5%[1]。这一结果与邱良祝等[2]的研究一致，表明生物质炭能改善土壤理化性质。然而，高浓度处理（T4）的增产效果不显著（P>0.05），可能与土壤 pH 过高有关[3]。";
  const corrections = [
    { num: 1, status: "pass" as const },
    { num: 2, status: "pass" as const },
    { num: 3, status: "fail" as const },
  ];

  useEffect(() => {
    setPhase("idle");
    setWriterText("");
    setVerifyResults([]);
    setRefineText("");
    const t: NodeJS.Timeout[] = [];

    t.push(setTimeout(() => setPhase("writing"), 500));

    for (let i = 0; i <= fullDraft.length; i++) {
      t.push(setTimeout(() => {
        setWriterText(fullDraft.slice(0, i));
        if (i === fullDraft.length) {
          t.push(setTimeout(() => setPhase("verifying"), 600));
        }
      }, 800 + i * 25));
    }

    t.push(setTimeout(() => setVerifyResults([{ num: 1, status: "checking" }]), 2800));
    t.push(setTimeout(() => setVerifyResults([{ num: 1, status: "pass" }, { num: 2, status: "checking" }]), 3600));
    t.push(setTimeout(() => setVerifyResults([{ num: 1, status: "pass" }, { num: 2, status: "pass" }, { num: 3, status: "checking" }]), 4400));
    t.push(setTimeout(() => {
      setVerifyResults(corrections);
      t.push(setTimeout(() => setPhase("refining"), 600));
    }, 5200));

    const correctedText = fullDraft.replace("可能与土壤 pH 过高有关[3]", "可能与土壤 pH 过高有关（P>0.05）[3]，需进一步验证");
    for (let i = 0; i <= correctedText.length; i++) {
      t.push(setTimeout(() => {
        setRefineText(correctedText.slice(0, i));
        if (i === correctedText.length) {
          t.push(setTimeout(() => setPhase("done"), 400));
        }
      }, 6200 + i * 20));
    }

    t.push(setTimeout(() => setLoop((l) => l + 1), 12000));
    return () => t.forEach(clearTimeout);
  }, [loop]);

  return (
    <div className="p-5 bg-white/5 backdrop-blur rounded-2xl border border-white/10 space-y-4 font-mono text-xs">
      <div className="flex items-center gap-2">
        {[
          { key: "writing", label: "Writer", color: "bg-blue-500" },
          { key: "verifying", label: "Verifier", color: "bg-emerald-500" },
          { key: "refining", label: "Refiner", color: "bg-purple-500" },
        ].map((s, i) => (
          <React.Fragment key={s.key}>
            {i > 0 && (
              <div
                className={`w-6 h-0.5 ${phase === "idle" ? "bg-white/10" : "bg-emerald-400/60"} transition-colors`}
              />
            )}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all duration-500 ${
                phase === s.key
                  ? "bg-emerald-500 text-white scale-110 shadow-lg shadow-emerald-500/30"
                  : phase === "done" || (["verifying", "refining"].includes(phase) && ["writing"].includes(s.key))
                    ? "bg-white/10 text-slate-400"
                    : "bg-white/5 text-slate-500"
              }`}
            >
              {s.label}
            </div>
          </React.Fragment>
        ))}
      </div>

      {phase === "writing" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
          <p className="text-blue-400 text-[10px] font-bold mb-1">Writer (DeepSeek) 正在生成...</p>
          <p className="text-slate-200 leading-relaxed">{writerText}<span className="animate-pulse text-blue-400">|</span></p>
        </motion.div>
      )}

      {phase === "verifying" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
          <p className="text-emerald-400 text-[10px] font-bold mb-2">Verifier (智谱 GLM-4) 正在核查引用...</p>
          <div className="space-y-1.5">
            {verifyResults.map((r) => (
              <motion.div key={r.num} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2">
                <span className="text-slate-400">[{r.num}]</span>
                {r.status === "checking" && <span className="text-amber-400 animate-pulse">核查中...</span>}
                {r.status === "pass" && <span className="text-emerald-400">✓ 通过</span>}
                {r.status === "fail" && <span className="text-rose-400">✗ 归属错误</span>}
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {(phase === "refining" || phase === "done") && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 bg-purple-500/10 rounded-xl border border-purple-500/20">
          <p className="text-purple-400 text-[10px] font-bold mb-1">
            Refiner {phase === "refining" ? "正在修正..." : "修正完成 ✓"}
          </p>
          <p className="text-slate-200 leading-relaxed">
            {phase === "refining"
              ? refineText
              : fullDraft.replace("可能与土壤 pH 过高有关[3]", "可能与土壤 pH 过高有关（P>0.05）[3]，需进一步验证")}
            {phase === "refining" && <span className="animate-pulse text-purple-400">|</span>}
          </p>
          {phase === "done" && (
            <p className="text-emerald-400 text-[10px] font-bold mt-2">已修正 1 处引用问题，保留原文风格</p>
          )}
        </motion.div>
      )}
    </div>
  );
}
