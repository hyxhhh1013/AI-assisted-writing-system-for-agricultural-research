"use client";

import { MarkdownContent, ReferencesSection } from "./shared";
import { formatKeywords } from "@/lib/paper-metadata";
import { ProjectData } from "@/lib/store";

interface TemplateProps {
  project: ProjectData;
  onCiteClick?: (nums: number[]) => void;
}

export function CASPreview({ project, onCiteClick }: TemplateProps) {
  const keywords = formatKeywords(project, "zh");
  return (
    <div className="p-12 font-serif text-[10.5pt] leading-[1.8] text-black max-w-[210mm] mx-auto bg-white">
      <header className="text-center mb-12">
        <h1 className="text-[18pt] font-bold mb-6">{project.title || "中国科学院学术论文模板"}</h1>
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
        {([
          ["引言", "introduction"],
          ["研究方法", "methods"],
          ["结果与讨论", "results"],
        ] as const).map(([label, key], i) => (
          <section key={key} className="break-inside-avoid">
            <h2 className="text-[14pt] font-bold mb-4 border-l-4 border-primary pl-3">{i + 1} {label}</h2>
            <div className="text-justify indent-8">
              <MarkdownContent content={project.sections[key] || ""} sectionNumber={i + 1} onCiteClick={onCiteClick} />
            </div>
          </section>
        ))}
        <ReferencesSection references={project.references} isChinese={true} />
      </div>
    </div>
  );
}
