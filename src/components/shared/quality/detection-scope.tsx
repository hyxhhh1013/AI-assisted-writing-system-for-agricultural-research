"use client";

import { Globe, BookOpen, FolderOpen, Brain, Sparkles, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const LAYERS = [
  { icon: FileText, label: "自引重复", desc: "文内段落相似比对" },
  { icon: FolderOpen, label: "跨项目", desc: "与同账户历史项目比对" },
  { icon: BookOpen, label: "文献库", desc: "实验室知识库 chunk 比对" },
  { icon: Brain, label: "语义相似", desc: "Embedding 向量余弦检测" },
  { icon: Globe, label: "联网学术", desc: "Semantic Scholar / OpenAlex（可选）" },
  { icon: Sparkles, label: "AI 评估", desc: "套话、疑似抄袭风险与改进建议" },
] as const;

interface DetectionScopeProps {
  webSearch: boolean;
  onToggleWeb?: (v: boolean) => void;
  compact?: boolean;
  className?: string;
}

export function DetectionScopePanel({
  webSearch,
  onToggleWeb,
  compact = false,
  className,
}: DetectionScopeProps) {
  return (
    <div className={cn("rounded-xl border border-[#1a5632]/10 bg-[#f6f5f1]/60", compact ? "p-3" : "p-4", className)}>
      <p className={cn("font-medium text-[#122820]", compact ? "mb-2 text-xs" : "mb-3 text-sm")}>
        检测范围
      </p>
      <div className={cn("grid gap-2", compact ? "grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
        {LAYERS.map(({ icon: Icon, label, desc }) => {
          const isWeb = label === "联网学术";
          const active = !isWeb || webSearch;
          const cls = cn(
            "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left",
            active ? "border-[#1a5632]/15 bg-white" : "border-dashed border-muted-foreground/20 bg-muted/20 opacity-60",
          );
          const body = (
            <>
              <Icon className={cn("shrink-0 text-[#1a5632]", compact ? "mt-0.5 h-3.5 w-3.5" : "mt-0.5 h-4 w-4")} />
              <div className="min-w-0">
                <p className={cn("font-medium text-[#122820]", compact ? "text-[10px]" : "text-xs")}>{label}</p>
                <p className={cn("text-[#6b7c72]", compact ? "text-[9px] leading-snug" : "text-[10px] leading-snug")}>{desc}</p>
              </div>
            </>
          );
          if (isWeb && onToggleWeb) {
            return (
              <button key={label} type="button" className={cls} onClick={() => onToggleWeb(!webSearch)}>
                {body}
              </button>
            );
          }
          return (
            <div key={label} className={cls}>
              {body}
            </div>
          );
        })}
      </div>
      <p className={cn("mt-2 text-[#9aa8a0]", compact ? "text-[9px]" : "text-[10px]")}>
        内部辅助检测，不等同于知网 / Turnitin；提交前请配合正式查重。点击「联网学术」可开关外部检索。
      </p>
    </div>
  );
}
