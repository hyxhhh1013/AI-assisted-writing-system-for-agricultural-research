"use client";

import { useEffect, useState, useRef, type ComponentPropsWithoutRef, type ElementType } from "react";
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
import { normalizeAllCitationFormats } from "@/lib/citation-bounds";
import { formatFilenames } from "@/services/references";

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
import { cleanMarkdownArtifacts } from "@/lib/utils";
export { normalizeMathDelimiters };

// react-markdown 额外传入 node prop，需要在类型中声明并在 spread 前析构掉
type MdProps<T extends ElementType> = ComponentPropsWithoutRef<T> & { node?: unknown };

// ==================== Shared Components ====================

/** 顶层章节标题 — 子标题冲突时跳过 */
const RESERVED_HEADINGS = new Set(["引言", "材料与方法", "结果与分析", "结论", "摘要", "参考文献", "Materials and Methods", "Results and Discussion", "Introduction", "Conclusion", "Abstract", "References"]);

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
      // 跳过与顶层章节标题冲突的子标题
      if (RESERVED_HEADINGS.has(titleText.trim())) return "";
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

/** 带越界检查的引用处理：越界引用渲染为红色警告 */
function processCitationsWithBounds(text: string, refCount?: number): string {
  if (!refCount || refCount <= 0) return processCitations(text);
  const normalized = normalizeAllCitationFormats(text);
  // 先处理越界引用为红色标记
  let result = normalized.replace(
    CITATION_GROUP_RE,
    (match, raw: string) => {
      const nums = expandCiteGroup(raw);
      const hasOutOfBounds = nums.some(n => n > refCount);
      if (hasOutOfBounds) {
        return `<sup class="ref-cite-oob" style="cursor:default;color:#dc2626;font-weight:700;background:#fef2f2;padding:0 2px;border-radius:2px;border:1px solid #fecaca" title="引用越界：编号 ${match} 超出文献列表范围">${match}</sup>`;
      }
      return `<sup class="ref-cite" data-cite="${raw.replace(/\s/g, "")}" style="cursor:pointer;color:#2563eb;font-weight:600;transition:color 0.15s">${match}</sup>`;
    },
  );
  return result;
}

export const MarkdownContent = ({
  content, sectionNumber, onCiteClick, refCount,
}: {
  content: string; sectionNumber?: number; onCiteClick?: (nums: number[]) => void; refCount?: number;
}) => {
  const processedContent = sectionNumber ? processContent(content, sectionNumber) : content;
  const cleanedContent = cleanMarkdownArtifacts(processedContent);
  const mathContent = normalizeMathDelimiters(cleanedContent);
  const citationContent = onCiteClick ? processCitationsWithBounds(mathContent, refCount) : mathContent;
  return (
    <div onClick={onCiteClick ? handleCiteClick(onCiteClick) : undefined}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[...(onCiteClick ? [rehypeRaw] : []), rehypeKatex]}
        components={{
          h1: () => <span className="hidden" />,
          h2: () => <span className="hidden" />,
          h3: ({ children, node: _n, ...props }: MdProps<'h3'>) => <h3 className="text-sm font-bold mt-4 mb-2" {...props}>{children}</h3>,
          h4: ({ children, node: _n, ...props }: MdProps<'h4'>) => <h4 className="text-[13px] font-bold mt-3 mb-1 italic" {...props}>{children}</h4>,
          p: ({ children, node: _n, ...props }: MdProps<'p'>) => <p className="mb-4 text-justify leading-relaxed" {...props}>{children}</p>,
          ul: ({ children, node: _n, ...props }: MdProps<'ul'>) => <ul className="list-disc ml-6 mb-4" {...props}>{children}</ul>,
          ol: ({ children, node: _n, ...props }: MdProps<'ol'>) => <ol className="list-decimal ml-6 mb-4" {...props}>{children}</ol>,
          li: ({ children, node: _n, ...props }: MdProps<'li'>) => <li className="mb-1" {...props}>{children}</li>,
        }}
      >
        {citationContent}
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
          h1: ({ children, node: _n, ...props }: MdProps<'h1'>) => <span {...props}>{children}</span>,
          h2: ({ children, node: _n, ...props }: MdProps<'h2'>) => <span {...props}>{children}</span>,
          h3: ({ children, node: _n, ...props }: MdProps<'h3'>) => <span {...props}>{children}</span>,
          p: ({ children, node: _n, ...props }: MdProps<'p'>) => <span className="text-justify inline" {...props}>{children}</span>,
          ul: ({ children, node: _n, ...props }: MdProps<'ul'>) => <ul className="list-disc ml-6 inline-block" {...props}>{children}</ul>,
          ol: ({ children, node: _n, ...props }: MdProps<'ol'>) => <ol className="list-decimal ml-6 inline-block" {...props}>{children}</ol>,
          li: ({ children, node: _n, ...props }: MdProps<'li'>) => <li className="mb-0" {...props}>{children}</li>,
        }}
      >
        {mathContent}
      </ReactMarkdown>
    </span>
  );
};

/** 简单清理：去掉 .pdf 后缀、替换下划线/连字符为空格 */
function cleanRefFilename(raw: string): string {
  return raw
    .replace(/^\[\d+\]\s*/, "")
    .replace(/\.pdf$/i, "")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const ReferencesSection = ({ references, isChinese }: { references?: string[]; isChinese: boolean }) => {
  const [formatted, setFormatted] = useState<Record<string, string>>({});
  const formatKeyRef = useRef("");

  useEffect(() => {
    if (!references || references.length === 0) return;
    const key = references.join("|");
    if (key === formatKeyRef.current) return;
    formatKeyRef.current = key;

    formatFilenames(references)
      .then((formatted) => setFormatted(formatted))
      .catch(() => {});
  }, [references]);

  return (
    <section className="mt-12 pt-8 border-t border-gray-200 break-inside-avoid">
      <h2 className={cn("font-bold mb-4", isChinese ? "text-[10.5pt]" : "text-base uppercase")}>
        {isChinese ? "参考文献：" : "References"}
      </h2>
      <div className={cn("space-y-1", isChinese ? "text-[9pt]" : "text-xs")}>
        {references && references.length > 0 ? (
          references.map((ref, idx) => {
            const citation = formatted[ref];
            const display = citation
              ? `[${idx + 1}] ${citation}`
              : `[${idx + 1}] ${cleanRefFilename(ref)}`;
            return <p key={idx} className="text-justify">{display}</p>;
          })
        ) : (
          <p className="italic text-muted-foreground">
            {isChinese ? "（暂无引用文献，请在扩写时通过 AI 自动引入）" : "(No references cited yet. References will be added automatically during AI writing.)"}
          </p>
        )}
      </div>
    </section>
  );
};