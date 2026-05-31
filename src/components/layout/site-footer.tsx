import { cn } from "@/lib/utils";

interface SiteFooterProps {
  className?: string;
}

export function SiteFooter({ className }: SiteFooterProps) {
  return (
    <footer
      className={cn(
        "relative mx-auto flex max-w-6xl flex-col items-center gap-2 border-t border-[#1a5632]/10 px-4 pb-10 pt-8 text-center sm:px-6",
        className,
      )}
    >
      <p className="text-xs text-[#6b7c72]">农业人工智能实验室 · 禾书耕文 GrainScript</p>
      <p className="text-[11px] text-[#9aa8a0]">私有 RAG · GB/T 7713 + SCI 双轨排版</p>
    </footer>
  );
}
