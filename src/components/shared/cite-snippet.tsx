"use client";

import { cn } from "@/lib/utils";

/** 文中摘录：本条 [n] 用实验室绿加粗，其它编号压灰。 */
export function CiteSnippetText({
  snippet,
  citeNum,
  className,
}: {
  snippet: string;
  citeNum: number;
  className?: string;
}) {
  return (
    <span className={cn("text-[13px] leading-relaxed text-[#3d4f46]", className)}>
      {snippet.split(/(\[[\d,\s\-–—]+\])/g).map((part, pi) => {
        const isCite = /^\[[\d,\s\-–—]+\]$/.test(part);
        if (!isCite) return <span key={pi}>{part}</span>;
        const matchesOwn = new RegExp(`\\[${citeNum}(?:[,\\s\\-–—\\d]*)\\]`).test(part);
        return (
          <span
            key={pi}
            className={cn(
              "font-semibold font-mono",
              matchesOwn ? "text-[#1a5632]" : "text-[#9aa8a0]",
            )}
          >
            {part}
          </span>
        );
      })}
    </span>
  );
}
