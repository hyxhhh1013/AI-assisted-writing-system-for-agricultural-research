"use client";

import { Quote, BookOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";
import { ProjectData } from "@/lib/store";
import { CITATION_GROUP_RE, expandCiteGroup, processCitations, handleCiteClick } from "@/lib/citation";

export const CITATION_RE = CITATION_GROUP_RE;
export { expandCiteGroup };

import { IMRAD_LABELS_SHORT_ZH } from "@/lib/imrad";

export const SECTION_LABELS: Record<string, string> = IMRAD_LABELS_SHORT_ZH;

/** 在项目所有章节中查找 [N] 的引用上下文 */
export function findCiteContextsInProject(
  project: ProjectData,
  citeNum: number,
): { sectionLabel: string; snippet: string }[] {
  const results: { sectionLabel: string; snippet: string }[] = [];
  const re = new RegExp(`\\[${citeNum}(?:[,\\s\\-–—\\d，、]*)\\]`);
  const entries: [string, string][] = [["abstract", project.abstract || ""]];
  for (const [key, label] of Object.entries(SECTION_LABELS)) {
    if (key === "abstract") continue;
    entries.push([key, project.sections[key] || ""]);
  }
  for (const [key, text] of entries) {
    if (!text) continue;
    const paragraphs = text.split(/\n\n+/);
    for (const para of paragraphs) {
      if (!re.test(para)) continue;
      const matchIdx = para.search(re);
      if (matchIdx === -1) continue;
      const start = Math.max(0, matchIdx - 80);
      const end = Math.min(para.length, matchIdx + 120);
      const snippet = (start > 0 ? "…" : "") + para.slice(start, end) + (end < para.length ? "…" : "");
      results.push({ sectionLabel: SECTION_LABELS[key] || key, snippet });
    }
  }
  return results;
}

import { normalizeMathDelimiters } from "@/lib/math-delimiter";
export { normalizeMathDelimiters };

// ==================== Shared Components ====================

/** 修正内容中的标题编号逻辑 */
export function processContent(content: string, sectionNumber: number) {
  if (!content) return "";
  let h2Counter = 0;
  let h3Counter = 0;
  return content.split("\n").map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      let titleText = headerMatch[2];
      titleText = titleText.replace(/^([\d\.]+|[一二三四五六七八九十]+[\.、\s])\s*/, "");
      if (level === 2 || level === 3) {
        h2Counter++;
        h3Counter = 0;
        return `### ${sectionNumber}.${h2Counter} ${titleText}`;
      } else if (level === 4) {
        h3Counter++;
        return `#### ${sectionNumber}.${h2Counter}.${h3Counter} ${titleText}`;
      }
      return titleText;
    }
    return line;
  }).join("\n");
}

export const MarkdownContent = ({
  content, sectionNumber, onCiteClick,
}: {
  content: string; sectionNumber?: number; onCiteClick?: (nums: number[]) => void;
}) => {
  const processedContent = sectionNumber ? processContent(content, sectionNumber) : content;
  const mathContent = normalizeMathDelimiters(processedContent);
  const citationContent = onCiteClick ? processCitations(mathContent) : mathContent;
  return (
    <div onClick={onCiteClick ? handleCiteClick(onCiteClick) : undefined}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[...(onCiteClick ? [rehypeRaw] : []), rehypeKatex]}
        components={{
          h1: () => <span className="hidden" />,
          h2: () => <span className="hidden" />,
          h3: ({ children, ...props }: any) => <h3 className="text-sm font-bold mt-4 mb-2" {...props}>{children}</h3>,
          h4: ({ children, ...props }: any) => <h4 className="text-[13px] font-bold mt-3 mb-1 italic" {...props}>{children}</h4>,
          p: ({ children, ...props }: any) => <p className="mb-4 text-justify leading-relaxed" {...props}>{children}</p>,
          ul: ({ children, ...props }: any) => <ul className="list-disc ml-6 mb-4" {...props}>{children}</ul>,
          ol: ({ children, ...props }: any) => <ol className="list-decimal ml-6 mb-4" {...props}>{children}</ol>,
          li: ({ children, ...props }: any) => <li className="mb-1" {...props}>{children}</li>,
        }}
      >
        {mathContent}
      </ReactMarkdown>
    </div>
  );
};

export const CompactMarkdown = ({ content, onCiteClick }: { content: string; onCiteClick?: (nums: number[]) => void }) => {
  const mathContent = normalizeMathDelimiters(content);
  const citationContent = onCiteClick ? processCitations(mathContent) : mathContent;
  return (
    <span onClick={onCiteClick ? handleCiteClick(onCiteClick) : undefined}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[...(onCiteClick ? [rehypeRaw] : []), rehypeKatex]}
        components={{
          h1: ({ children, ...props }: any) => <span {...props}>{children}</span>,
          h2: ({ children, ...props }: any) => <span {...props}>{children}</span>,
          h3: ({ children, ...props }: any) => <span {...props}>{children}</span>,
          p: ({ children, ...props }: any) => <span className="text-justify inline" {...props}>{children}</span>,
          ul: ({ children, ...props }: any) => <ul className="list-disc ml-6 inline-block" {...props}>{children}</ul>,
          ol: ({ children, ...props }: any) => <ol className="list-decimal ml-6 inline-block" {...props}>{children}</ol>,
          li: ({ children, ...props }: any) => <li className="mb-0" {...props}>{children}</li>,
        }}
      >
        {mathContent}
      </ReactMarkdown>
    </span>
  );
};

export const ReferencesSection = ({ references, isChinese }: { references?: string[]; isChinese: boolean }) => (
  <section className="mt-12 pt-8 border-t border-gray-200 break-inside-avoid">
    <h2 className={cn("font-bold mb-4", isChinese ? "text-[10.5pt]" : "text-base uppercase")}>
      {isChinese ? "参考文献：" : "References"}
    </h2>
    <div className={cn("space-y-1", isChinese ? "text-[9pt]" : "text-xs")}>
      {references && references.length > 0 ? (
        references.map((ref, idx) => <p key={idx} className="text-justify">[{idx + 1}] {ref}</p>)
      ) : (
        <p className="italic text-muted-foreground">
          {isChinese ? "（暂无引用文献，请在扩写时通过 AI 自动引入）" : "(No references cited yet. References will be added automatically during AI writing.)"}
        </p>
      )}
    </div>
  </section>
);