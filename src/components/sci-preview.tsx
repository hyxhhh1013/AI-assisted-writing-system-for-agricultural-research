"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Quote, BookOpen } from "lucide-react";
import { ProjectData } from "@/lib/store";
import { formatClassification, formatKeywords } from "@/lib/paper-metadata";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CITATION_RE = /\[([0-9,\s\-–—]+)\]/g;

const SECTION_LABELS: Record<string, string> = {
  abstract: "摘要",
  introduction: "引言",
  methods: "材料与方法",
  results: "结果与讨论",
  conclusion: "结论",
};

/** 在项目所有章节中查找 [N] 的引用上下文 */
function findCiteContextsInProject(
  project: ProjectData,
  citeNum: number,
): { sectionLabel: string; snippet: string }[] {
  const results: { sectionLabel: string; snippet: string }[] = [];
  const re = new RegExp(`\\[${citeNum}(?:[,\\s\\-–—\\d]*)\\]`);
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
      const snippet =
        (start > 0 ? "…" : "") +
        para.slice(start, end) +
        (end < para.length ? "…" : "");
      results.push({ sectionLabel: SECTION_LABELS[key] || key, snippet });
    }
  }
  return results;
}

/** 将正文中的 [n] 替换为可点击的 HTML 标签 */
function processCitations(text: string): string {
  return text.replace(
    CITATION_RE,
    (match, raw: string) =>
      `<sup class="ref-cite" data-cite="${raw.replace(/\s/g, "")}" style="cursor:pointer;color:#2563eb;font-weight:600;transition:color 0.15s">${match}</sup>`,
  );
}

/** 将引用组 "1,2,3-5" 展开为数字数组 */
function expandCiteGroup(raw: string): number[] {
  const nums: number[] = [];
  const parts = raw.split(",");
  for (const part of parts) {
    const token = part.trim();
    if (!token) continue;
    const range = token.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (range) {
      const start = Math.max(1, parseInt(range[1], 10));
      const end = Math.max(start, parseInt(range[2], 10));
      for (let n = start; n <= end; n++) {
        if (!nums.includes(n)) nums.push(n);
      }
    } else {
      const n = parseInt(token, 10);
      if (!isNaN(n) && n > 0 && !nums.includes(n)) nums.push(n);
    }
  }
  return nums;
}

interface SCIPreviewProps {
  project: ProjectData;
}

// 修正内容中的标题编号逻辑
const processContent = (content: string, sectionNumber: number) => {
  if (!content) return "";
  
  let h2Counter = 0;
  let h3Counter = 0;

  return content.split("\n").map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    
    // 识别 Markdown 标题
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      let titleText = headerMatch[2];
      
      // 1. 彻底剥离可能存在的原始编号 (3.1, 1.2.3, 一、 等)
      titleText = titleText.replace(/^([\d\.]+|[一二三四五六七八九十]+[\.、\s])\s*/, "");

      if (level === 2) {
        // 对于二级标题（通常是用户在正文里误用了 ##），我们将其视为普通加粗文本或三级标题处理
        // 为了保持结构一致，这里将其转换为 ### (三级)
        h2Counter++;
        h3Counter = 0;
        return `### ${sectionNumber}.${h2Counter} ${titleText}`;
      } else if (level === 3) { // 对应预览的二级标题 (###)
        h2Counter++;
        h3Counter = 0;
        return `### ${sectionNumber}.${h2Counter} ${titleText}`;
      } else if (level === 4) { // 对应预览的三级标题 (####)
        h3Counter++;
        return `#### ${sectionNumber}.${h2Counter}.${h3Counter} ${titleText}`;
      }
      // 移除其他级别的 # 标记，直接返回纯文本标题，避免渲染混乱
      return titleText;
    }
    
    return line;
  }).join("\n");
};

// 提取 Markdown 渲染组件以保持代码整洁
const MarkdownContent = ({
  content,
  sectionNumber,
  onCiteClick,
}: {
  content: string;
  sectionNumber?: number;
  onCiteClick?: (nums: number[]) => void;
}) => {
  const processedContent = sectionNumber ? processContent(content, sectionNumber) : content;
  const citationContent = onCiteClick ? processCitations(processedContent) : processedContent;

  return (
    <div onClick={onCiteClick ? handleCiteClick(onCiteClick) : undefined}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={onCiteClick ? [rehypeRaw] : undefined}
        components={{
          h1: ({ node, ...props }) => <span className="hidden" {...props} />,
          h2: ({ node, ...props }) => <span className="hidden" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-sm font-bold mt-4 mb-2" {...props} />,
          h4: ({ node, ...props }) => (
            <h4 className="text-[13px] font-bold mt-3 mb-1 italic" {...props} />
          ),
          p: ({ node, ...props }) => <p className="mb-4 text-justify leading-relaxed" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc ml-6 mb-4" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal ml-6 mb-4" {...props} />,
          li: ({ node, ...props }) => <li className="mb-1" {...props} />,
        }}
      >
        {citationContent}
      </ReactMarkdown>
    </div>
  );
};

/**
 * 创建点击事件处理器，从 DOM 事件代理检测引用点击
 */
function handleCiteClick(onCiteClick: (nums: number[]) => void) {
  return (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const cite = target.closest(".ref-cite") as HTMLElement | null;
    if (!cite) return;
    const raw = cite.getAttribute("data-cite");
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    onCiteClick(expandCiteGroup(raw));
  };
}

// 紧凑型 Markdown 渲染（用于摘要等区域）
const CompactMarkdown = ({ content, onCiteClick }: { content: string; onCiteClick?: (nums: number[]) => void }) => {
  const citationContent = onCiteClick ? processCitations(content) : content;

  return (
    <span onClick={onCiteClick ? handleCiteClick(onCiteClick) : undefined}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={onCiteClick ? [rehypeRaw] : undefined}
        components={{
          h1: ({ node, ...props }) => <span {...props} />,
          h2: ({ node, ...props }) => <span {...props} />,
          h3: ({ node, ...props }) => <span {...props} />,
          p: ({ node, ...props }) => <span className="text-justify inline" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc ml-6 inline-block" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal ml-6 inline-block" {...props} />,
          li: ({ node, ...props }) => <li className="mb-0" {...props} />,
        }}
      >
        {citationContent}
      </ReactMarkdown>
    </span>
  );
};

// 统一的参考文献组件
const ReferencesSection = ({ references, isChinese }: { references?: string[], isChinese: boolean }) => (
  <section className="mt-12 pt-8 border-t border-gray-200 break-inside-avoid">
    <h2 className={cn(
      "font-bold mb-4",
      isChinese ? "text-[10.5pt]" : "text-base uppercase"
    )}>
      {isChinese ? "参考文献：" : "References"}
    </h2>
    <div className={cn(
      "space-y-1",
      isChinese ? "text-[9pt]" : "text-xs"
    )}>
      {references && references.length > 0 ? (
        references.map((ref, idx) => (
          <p key={idx} className="text-justify">
            [{idx + 1}] {ref}
          </p>
        ))
      ) : (
        <p className="italic text-muted-foreground">
          {isChinese ? "（暂无引用文献，请在扩写时通过 AI 自动引入）" : "(No references cited yet. References will be added automatically during AI writing.)"}
        </p>
      )}
    </div>
  </section>
);

interface RagSnippet {
  content: string;
  source: string;
  score?: number;
}

export default function SCIPreview({ project }: SCIPreviewProps) {
  const [citeDialogOpen, setCiteDialogOpen] = useState(false);
  const [selectedCiteNums, setSelectedCiteNums] = useState<number[]>([]);
  const [ragResults, setRagResults] = useState<Record<number, RagSnippet[]>>({});
  const [ragLoading, setRagLoading] = useState(false);

  const refs = project.references || [];

  const handleCiteClick = useCallback((nums: number[]) => {
    setSelectedCiteNums(nums);
    setCiteDialogOpen(true);
  }, []);

  // 打开引用对话框时，搜索 RAG 获取原文片段
  useEffect(() => {
    if (!citeDialogOpen || selectedCiteNums.length === 0) return;
    setRagLoading(true);
    const fetchResults = async () => {
      const results: Record<number, RagSnippet[]> = {};
      for (const n of selectedCiteNums) {
        const ref = refs[n - 1];
        if (!ref) continue;
        try {
          // 使用引用文字搜索 RAG 索引（前 50 个字作为关键词）
          const query = ref.slice(0, 100);
          const res = await fetch(`/api/knowledge?q=${encodeURIComponent(query)}&type=semantic&pageSize=5`);
          const json = await res.json();
          if (json?.files) {
            results[n] = json.files.flatMap((f: any) =>
              (f._snippets || []).map((s: string) => ({
                content: s,
                source: f.name,
              }))
            );
          }
        } catch { /* RAG search is optional */ }
      }
      setRagResults(results);
      setRagLoading(false);
    };
    fetchResults();
  }, [citeDialogOpen, selectedCiteNums]);

  const citeDialogContent = selectedCiteNums
    .map((n) => {
      const ref = refs[n - 1];
      return ref ? `[${n}] ${ref}` : null;
    })
    .filter(Boolean)
    .join("\n\n");

  const renderTemplate = () => {
    const previewProps = { project, onCiteClick: handleCiteClick };
    switch (project.template) {
      case "ieee":
        return <IEEEPreview {...previewProps} />;
      case "gbt7713":
        return <GBT7713Preview {...previewProps} />;
      case "cas":
        return <CASPreview {...previewProps} />;
      case "nature":
        return <NaturePreview {...previewProps} />;
      default:
        return <StandardSCIPreview {...previewProps} />;
    }
  };

  return (
    <>
      <div className="bg-white shadow-inner min-h-full print:shadow-none print:p-0 pdf-export-container">
        {renderTemplate()}
      </div>

      <Dialog open={citeDialogOpen} onOpenChange={setCiteDialogOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-hidden p-0">
          <DialogHeader>
            <div className="px-6 pt-5 pb-3 border-b">
              <DialogTitle className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground font-mono">
                  [{selectedCiteNums.join(", ")}]
                </span>
                引用文献
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="overflow-y-auto px-6 py-4 max-h-[calc(85vh-80px)] space-y-5">
            {selectedCiteNums.map((n) => {
              const ref = refs[n - 1];
              if (!ref) return null;
              const contexts = findCiteContextsInProject(project, n);
              return (
                <div key={n} className="space-y-3">
                  {/* 文献条目 */}
                  <div className="p-3 rounded-lg bg-muted/30 border text-xs leading-relaxed">
                    <span className="font-bold text-primary font-mono">[{n}]</span> {ref}
                  </div>

                  {/* RAG 原文片段 */}
                  {ragLoading && (
                    <div className="text-[11px] text-muted-foreground animate-pulse">正在检索原文...</div>
                  )}
                  {!ragLoading && ragResults[n] && ragResults[n].length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        原文出处
                      </span>
                      {ragResults[n].map((s, i) => (
                        <div key={i} className="pl-3 border-l-2 border-green-500/40 text-[11px] leading-relaxed">
                          <span className="text-[9px] font-medium text-green-600/70 block mb-0.5">{s.source}</span>
                          {s.content}
                        </div>
                      ))}
                    </div>
                  )}
                  {!ragLoading && ragResults[n] && ragResults[n].length === 0 && (
                    <div className="text-[11px] text-muted-foreground italic">未在已索引文献中找到匹配原文</div>
                  )}

                  {/* 引用位置 */}
                  {contexts.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                        <Quote className="h-3 w-3" />
                        文中引用位置
                      </span>
                      {contexts.map((ctx, ci) => (
                        <div key={ci} className="space-y-0.5">
                          {ctx.sectionLabel && (
                            <span className="text-[9px] text-muted-foreground/60 font-medium ml-1">
                              {ctx.sectionLabel}
                            </span>
                          )}
                          <div className="text-[11px] leading-relaxed text-foreground bg-amber-50 border border-amber-200 rounded-md p-2.5">
                            {ctx.snippet.split(/(\[[\d,\s\-–—]+\])/g).map((part, pi) => {
                              const isCite = /^\[[\d,\s\-–—]+\]$/.test(part);
                              const matchesOwn = new RegExp(`\\[${n}(?:[,\\s\\-–—\\d]*)\\]`).test(part);
                              return isCite ? (
                                <span
                                  key={pi}
                                  className={cn(
                                    "font-bold",
                                    matchesOwn ? "text-blue-600" : "text-gray-400",
                                  )}
                                >
                                  {part}
                                </span>
                              ) : (
                                <span key={pi}>{part}</span>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface TemplateProps extends SCIPreviewProps {
  onCiteClick?: (nums: number[]) => void;
}

/**
 * 标准 SCI 模板 (类似于 Elsevier/Springer 通用格式)
 */
function StandardSCIPreview({ project, onCiteClick }: TemplateProps) {
  return (
    <div className="p-12 font-serif text-[#1a1a1a] leading-relaxed max-w-[210mm] mx-auto bg-white">
      <header className="text-center mb-12 border-b pb-8">
        <h1 className="text-3xl font-bold mb-6 uppercase tracking-tight leading-tight">
          {project.title || "Untitled Research Paper"}
        </h1>
        <div className="flex flex-col gap-2">
          <p className="text-base font-medium">{project.authors || "Author Name Not Set"}</p>
          <p className="text-xs text-muted-foreground italic">Agricultural Science Laboratory, Research Institute of Agriculture, 2024</p>
        </div>
      </header>

      <section className="mb-10 break-inside-avoid">
        <h2 className="text-lg font-bold uppercase mb-3 border-b-2 border-black pb-1 inline-block">Abstract</h2>
        <div className="text-sm leading-7 first-letter:text-2xl first-letter:font-bold first-letter:mr-1">
          <MarkdownContent content={project.abstract || "Abstract content will appear here after generation."} onCiteClick={onCiteClick} />
        </div>
      </section>

      <section className="mb-8 break-inside-avoid">
        <h2 className="text-base font-bold uppercase mb-4 flex items-center gap-3">
          <span className="bg-black text-white px-2 py-0.5 text-sm">1</span> Introduction
        </h2>
        <div className="text-sm leading-7">
          <MarkdownContent content={project.sections.introduction || ""} sectionNumber={1} onCiteClick={onCiteClick} />
        </div>
      </section>

      <section className="mb-8 break-inside-avoid">
        <h2 className="text-base font-bold uppercase mb-4 flex items-center gap-3">
          <span className="bg-black text-white px-2 py-0.5 text-sm">2</span> Materials and Methods
        </h2>
        <div className="text-sm leading-7">
          <MarkdownContent content={project.sections.methods || ""} sectionNumber={2} onCiteClick={onCiteClick} />
        </div>
      </section>

      <section className="mb-8 break-inside-avoid">
        <h2 className="text-base font-bold uppercase mb-4 flex items-center gap-3">
          <span className="bg-black text-white px-2 py-0.5 text-sm">3</span> Results and Discussion
        </h2>
        <div className="text-sm leading-7">
          <MarkdownContent content={project.sections.results || ""} sectionNumber={3} onCiteClick={onCiteClick} />
        </div>
      </section>

      <section className="mb-8 break-inside-avoid">
        <h2 className="text-base font-bold uppercase mb-4 flex items-center gap-3">
          <span className="bg-black text-white px-2 py-0.5 text-sm">4</span> Conclusion
        </h2>
        <div className="text-sm leading-7">
          <MarkdownContent content={project.sections.conclusion || ""} sectionNumber={4} onCiteClick={onCiteClick} />
        </div>
      </section>

      <ReferencesSection references={project.references} isChinese={false} />
    </div>
  );
}

/**
 * IEEE 会刊模板 (双栏排版)
 */
function IEEEPreview({ project, onCiteClick }: TemplateProps) {
  const keywords = formatKeywords(project, "en");

  return (
    <div className="p-8 font-serif text-[9pt] leading-[1.1] text-black max-w-[210mm] mx-auto bg-white">
      <div className="text-center mb-8">
        <h1 className="text-[24pt] mb-6 font-normal tracking-tight leading-tight">
          {project.title || "Untitled Paper"}
        </h1>
        <p className="text-[11pt] mb-4">{project.authors}</p>
      </div>

      <div>
        <div className="mb-4">
          <div className="text-justify font-bold italic">
            Abstract—<span className="font-normal not-italic"><MarkdownContent content={project.abstract || "Abstract content..."} onCiteClick={onCiteClick} /></span>
          </div>
          <p className="mt-2 text-justify font-bold italic">
            Keywords—{keywords}.
          </p>
        </div>

        <div className="[column-count:2] [column-gap:2rem]">
          <section className="mb-4 break-inside-avoid">
          <h2 className="text-center text-[10pt] uppercase mb-2 tracking-widest font-normal">I. Introduction</h2>
          <div className="text-justify indent-4">
            <MarkdownContent content={project.sections.introduction || ""} onCiteClick={onCiteClick} />
          </div>
          </section>

          <section className="mb-4 break-inside-avoid">
          <h2 className="text-center text-[10pt] uppercase mb-2 mt-4 tracking-widest font-normal">II. Materials and Methods</h2>
          <div className="text-justify indent-4">
            <MarkdownContent content={project.sections.methods || ""} onCiteClick={onCiteClick} />
          </div>
          </section>

          <section className="mb-4 break-inside-avoid">
          <h2 className="text-center text-[10pt] uppercase mb-2 tracking-widest font-normal">III. Results</h2>
          <div className="text-justify indent-4">
            <MarkdownContent content={project.sections.results || ""} onCiteClick={onCiteClick} />
          </div>
          </section>

          <section className="mb-4 break-inside-avoid">
          <h2 className="text-center text-[10pt] uppercase mb-2 mt-4 tracking-widest font-normal">IV. Conclusion</h2>
          <div className="text-justify indent-4">
            <MarkdownContent content={project.sections.conclusion || ""} onCiteClick={onCiteClick} />
          </div>
          </section>
        </div>
      </div>
      <ReferencesSection references={project.references} isChinese={false} />
    </div>
  );
}

/**
 * GB/T 7713 (国家标准学术论文格式)
 */
function GBT7713Preview({ project, onCiteClick }: TemplateProps) {
  const keywords = formatKeywords(project, "zh");
  const classification = formatClassification(project);

  return (
    <div className="p-[20mm] font-serif text-[10.5pt] leading-[1.6] text-black max-w-[210mm] mx-auto bg-white">
      <header className="text-center mb-10">
        <h1 className="text-[16pt] font-bold mb-6 font-sans tracking-wide">
          {project.title || "无标题论文"}
        </h1>
        <p className="text-[12pt] mb-2">{project.authors || "作者姓名"}</p>
        <p className="text-[9pt] text-gray-700 mb-8">（{project.affiliations || "作者单位信息"}）</p>
      </header>

      <section className="mb-8 text-[10.5pt] space-y-2 break-inside-avoid">
        <div className="flex text-justify">
          <span className="font-bold shrink-0">摘要：</span>
          <div className="flex-1"><CompactMarkdown content={project.abstract || "摘要内容..."} onCiteClick={onCiteClick} /></div>
        </div>
        <div className="flex">
          <span className="font-bold shrink-0">关键词：</span>
          <div className="flex-1">{keywords}</div>
        </div>
        {classification ? (
          <div className="flex text-[9pt]">
            <span className="font-bold shrink-0">中图分类号：</span>
            <div className="flex-1">{classification}</div>
          </div>
        ) : null}
      </section>

      <div className="space-y-8">
        <section className="block break-inside-avoid">
          <h2 className="text-[12pt] font-bold mb-4 border-b pb-1">1 引言</h2>
          <div className="text-justify indent-[2em]">
            <MarkdownContent content={project.sections.introduction || ""} sectionNumber={1} onCiteClick={onCiteClick} />
          </div>
        </section>

        <section className="block break-inside-avoid">
          <h2 className="text-[12pt] font-bold mb-4 border-b pb-1">2 材料与方法</h2>
          <div className="text-justify indent-[2em]">
            <MarkdownContent content={project.sections.methods || ""} sectionNumber={2} onCiteClick={onCiteClick} />
          </div>
        </section>

        <section className="block break-inside-avoid">
          <h2 className="text-[12pt] font-bold mb-4 border-b pb-1">3 结果与分析</h2>
          <div className="text-justify indent-[2em]">
            <MarkdownContent content={project.sections.results || ""} sectionNumber={3} onCiteClick={onCiteClick} />
          </div>
        </section>

        <section className="block break-inside-avoid">
          <h2 className="text-[12pt] font-bold mb-4 border-b pb-1">4 结论</h2>
          <div className="text-justify indent-[2em]">
            <MarkdownContent content={project.sections.conclusion || ""} sectionNumber={4} onCiteClick={onCiteClick} />
          </div>
        </section>

        <ReferencesSection references={project.references} isChinese={true} />
      </div>
    </div>
  );
}

/**
 * Nature 风格模板
 */
function NaturePreview({ project, onCiteClick }: TemplateProps) {
  return (
    <div className="p-10 font-serif text-[10pt] leading-tight text-black max-w-[210mm] mx-auto bg-white">
      <div className="mb-10">
        <h1 className="text-[28pt] font-bold tracking-tighter leading-[1.1] mb-6">
          {project.title || "Untitled Nature Article"}
        </h1>
        <div className="text-[11pt] font-bold border-b-2 border-black pb-2 mb-4">
          {project.authors}
        </div>
      </div>

      <div className="mb-8 text-[11pt] font-bold leading-relaxed text-justify">
        <MarkdownContent content={project.abstract || "Abstract without heading, as per Nature style."} onCiteClick={onCiteClick} />
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="text-justify first-letter:text-4xl first-letter:font-bold first-letter:float-left first-letter:mr-2 first-letter:mt-1">
            <MarkdownContent content={project.sections.introduction || ""} onCiteClick={onCiteClick} />
          </div>
          <h2 className="text-[12pt] font-bold border-t pt-4">Results</h2>
          <div className="text-justify">
            <MarkdownContent content={project.sections.results || ""} onCiteClick={onCiteClick} />
          </div>
        </div>
        <div className="space-y-4">
          <h2 className="text-[12pt] font-bold border-t pt-4">Methods</h2>
          <div className="text-justify text-[9pt] bg-muted/20 p-4 rounded">
            <MarkdownContent content={project.sections.methods || ""} onCiteClick={onCiteClick} />
          </div>
          <h2 className="text-[12pt] font-bold border-t pt-4">Discussion</h2>
          <div className="text-justify">
            <MarkdownContent content={project.sections.conclusion || ""} onCiteClick={onCiteClick} />
          </div>
        </div>
      </div>
      <ReferencesSection references={project.references} isChinese={false} />
    </div>
  );
}

/**
 * 中科院期刊风格 (CAS)
 */
function CASPreview({ project, onCiteClick }: TemplateProps) {
  const keywords = formatKeywords(project, "zh");

  return (
    <div className="p-12 font-serif text-[10.5pt] leading-[1.8] text-black max-w-[210mm] mx-auto bg-white">
      <header className="text-center mb-12">
        <h1 className="text-[18pt] font-bold mb-6">
          {project.title || "中国科学院学术论文模板"}
        </h1>
        <p className="text-[12pt] mb-4 font-sans">{project.authors}</p>
        <p className="text-[10pt] italic">（{project.affiliations || "中国科学院农业资源研究中心，石家庄 050021"}）</p>
      </header>

      <section className="mb-10 bg-gray-50 p-6 border-y border-gray-200 break-inside-avoid">
        <div className="text-justify mb-2">
          <span className="font-bold font-sans">摘要：</span>
          <MarkdownContent content={project.abstract || ""} onCiteClick={onCiteClick} />
        </div>
        <p><span className="font-bold font-sans">关键词：</span>{keywords}</p>
      </section>

      <div className="space-y-8">
        <section className="break-inside-avoid">
          <h2 className="text-[14pt] font-bold mb-4 border-l-4 border-primary pl-3">1 引言</h2>
          <div className="text-justify indent-8">
            <MarkdownContent content={project.sections.introduction || ""} sectionNumber={1} onCiteClick={onCiteClick} />
          </div>
        </section>
        
        <section className="break-inside-avoid">
          <h2 className="text-[14pt] font-bold mb-4 border-l-4 border-primary pl-3">2 研究方法</h2>
          <div className="text-justify indent-8">
            <MarkdownContent content={project.sections.methods || ""} sectionNumber={2} onCiteClick={onCiteClick} />
          </div>
        </section>

        <section className="break-inside-avoid">
          <h2 className="text-[14pt] font-bold mb-4 border-l-4 border-primary pl-3">3 结果与讨论</h2>
          <div className="text-justify indent-8">
            <MarkdownContent content={project.sections.results || ""} sectionNumber={3} onCiteClick={onCiteClick} />
          </div>
        </section>

        <ReferencesSection references={project.references} isChinese={true} />
      </div>
    </div>
  );
}
