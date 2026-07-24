"use client";

import { siteTheme } from "@/lib/site-theme";
import { BookOpen, Leaf, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WelcomeScreenProps {
  onStart: () => void;
  onResume: (() => void) | null;
}

export function WelcomeScreen({ onStart, onResume }: WelcomeScreenProps) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-[#1a5632]/12 bg-gradient-to-br from-[#faf9f6] via-white to-[#e8f0ea] px-6 py-12 sm:px-12 sm:py-16">
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-40"
        style={{ background: "radial-gradient(circle, #1a563233, transparent 70%)" }}
      />
      <div className="relative max-w-xl">
        <p className="mb-3 flex items-center gap-2 text-sm font-medium tracking-wide text-[#1a5632]">
          <Leaf className="h-4 w-4" />
          禾书耕文 · 学术论文工作坊
        </p>
        <h1 className="text-3xl font-bold leading-tight text-[#122820] sm:text-4xl">
          按步骤写完一篇论文
        </h1>
        <p className="mt-4 text-base leading-relaxed text-[#3d4f46]">
          先关联上面的论文项目，再选写作方式。每一步的绿色按钮会打开真实工作台（扩写、文献、绘图），不是空按钮。
        </p>
        <ul className="mt-6 space-y-2 text-sm text-[#3d4f46]">
          <li className="flex gap-2">
            <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-[#1a5632]" />
            流程对齐学术论文八阶段；配置确认、大纲批准等检查点仍会拦住跳步
          </li>
          <li className="flex gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#1a5632]" />
            第一次写？选「一步步想清楚」；已经有题目？选「写完整篇论文」后可跳过长访谈
          </li>
        </ul>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button className={siteTheme.btnPrimary} size="lg" onClick={onStart}>
            开始新的论文
          </Button>
          {onResume ? (
            <Button variant="outline" size="lg" onClick={onResume}>
              继续上次进度
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
